using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Aura.UploaderClient
{
    public class AuraHmacSigner
    {
        private const string ALGORITHM = "AURA-HMAC-SHA256";
        private const string SERVICE = "aura_request";
        
        private static readonly string[] REQUIRED_SIGNED_HEADERS = {
            "host",
            "x-aura-nonce", 
            "x-aura-timestamp"
        };

        public class HttpRequest
        {
            public string Method { get; set; } = "GET";
            public string? BaseUrl { get; set; }
            public string Url { get; set; } = "/";
            public Dictionary<string, string> Headers { get; set; } = new();
            public Dictionary<string, object> Query { get; set; } = new();
            public object? Body { get; set; }
        }

        public static void SignRequest(string appId, string appSecret, HttpRequest request)
        {
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
            var nonce = Guid.NewGuid().ToString();
            var date = DateTime.UtcNow.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

            request.Headers ??= new Dictionary<string, string>();

            request.Headers["X-Aura-Timestamp"] = timestamp;
            request.Headers["X-Aura-Nonce"] = nonce;

            var methodUpper = request.Method?.ToUpperInvariant() ?? "GET";
            var hasBody = (methodUpper == "POST" || methodUpper == "PUT" || methodUpper == "PATCH") && request.Body != null;
            
            if (hasBody && !HeaderExists(request.Headers, "Content-Type"))
            {
                request.Headers["Content-Type"] = "application/json";
            }

            var (canonicalPath, canonicalQuery) = CanonicalizeUrl(request.BaseUrl, request.Url, request.Query);
            var payloadHash = HashPayloadSha256Hex(request.Body);
            var signedHeaders = ComputeSignedHeaders(request.Headers);
            var canonicalHeaders = BuildCanonicalHeaders(request.Headers, signedHeaders);

            var canonicalRequest = string.Join("\n", new[]
            {
                methodUpper,
                canonicalPath,
                canonicalQuery,
                canonicalHeaders,
                signedHeaders,
                payloadHash
            });

            var canonicalRequestHash = ComputeSha256Hex(Encoding.UTF8.GetBytes(canonicalRequest));
            var credentialScope = $"{appId}/{date}/{SERVICE}";
            
            var stringToSign = string.Join("\n", new[]
            {
                ALGORITHM,
                timestamp,
                credentialScope,
                canonicalRequestHash
            });

            // Key derivation
            var dateKey = ComputeHmacSha256Raw(Encoding.UTF8.GetBytes("AURA" + appSecret), Encoding.UTF8.GetBytes(date));
            var signingKey = ComputeHmacSha256Raw(dateKey, Encoding.UTF8.GetBytes(SERVICE));
            var signatureHex = ComputeHmacSha256Hex(signingKey, Encoding.UTF8.GetBytes(stringToSign));

            request.Headers["Authorization"] = 
                $"{ALGORITHM} " +
                $"Credential={appId}," +
                $"SignedHeaders={signedHeaders}," +
                $"Signature={signatureHex}";
        }

        private static bool HeaderExists(Dictionary<string, string> headers, string name)
        {
            return headers.Keys.Any(k => k.Equals(name, StringComparison.OrdinalIgnoreCase));
        }

        private static string NormalizeHeaderValue(string value)
        {
            return string.Join(" ", value.Trim().Split(new[] { ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries));
        }

        private static string ComputeSignedHeaders(Dictionary<string, string> headers)
        {
            var signed = new HashSet<string>(REQUIRED_SIGNED_HEADERS, StringComparer.OrdinalIgnoreCase);
            
            if (HeaderExists(headers, "Content-Type"))
            {
                signed.Add("content-type");
            }

            var signedNonEmpty = new List<string>();
            foreach (var header in signed)
            {
                var value = GetHeaderValueCaseInsensitive(headers, header);
                if (!string.IsNullOrEmpty(NormalizeHeaderValue(value)))
                {
                    signedNonEmpty.Add(header);
                }
            }

            signedNonEmpty.Sort(StringComparer.OrdinalIgnoreCase);
            return string.Join(";", signedNonEmpty);
        }

        private static string BuildCanonicalHeaders(Dictionary<string, string> headers, string signedHeadersStr)
        {
            var signedList = signedHeadersStr.Split(';', StringSplitOptions.RemoveEmptyEntries);
            var lines = new List<string>();
            
            foreach (var header in signedList)
            {
                var value = GetHeaderValueCaseInsensitive(headers, header);
                lines.Add($"{header}:{NormalizeHeaderValue(value)}");
            }
            
            return string.Join("\n", lines) + "\n";
        }

        private static string GetHeaderValueCaseInsensitive(Dictionary<string, string> headers, string name)
        {
            return headers.FirstOrDefault(kvp => kvp.Key.Equals(name, StringComparison.OrdinalIgnoreCase)).Value ?? "";
        }

        private static (string path, string query) CanonicalizeUrl(string? baseUrl, string url, Dictionary<string, object> queryMap)
        {
            var isAbsolute = Uri.IsWellFormedUriString(url, UriKind.Absolute);
            var fullUrl = isAbsolute ? url : new Uri(new Uri(baseUrl ?? ""), url).ToString();
            var uri = new Uri(fullUrl);
            
            var queryString = uri.Query.TrimStart('?');
            if (queryMap.Any())
            {
                var queryBuilder = new List<string>();
                
                // Add existing query parameters
                if (!string.IsNullOrEmpty(queryString))
                {
                    queryBuilder.AddRange(queryString.Split('&', StringSplitOptions.RemoveEmptyEntries));
                }
                
                // Add new query parameters
                foreach (var kvp in queryMap)
                {
                    queryBuilder.Add($"{Uri.EscapeDataString(kvp.Key)}={Uri.EscapeDataString(kvp.Value?.ToString() ?? "")}");
                }
                
                queryString = string.Join("&", queryBuilder);
            }

            // Sort query parameters lexicographically
            var sortedQuery = string.Join("&", queryString
                .Split('&', StringSplitOptions.RemoveEmptyEntries)
                .Where(part => !string.IsNullOrEmpty(part))
                .Select(part => part.Split('=', 2))
                .OrderBy(part => part[0], StringComparer.Ordinal)
                .Select(part => part.Length == 2 ? $"{part[0]}={part[1]}" : part[0]));

            var canonicalPath = Uri.UnescapeDataString(uri.AbsolutePath);
            
            return (canonicalPath, sortedQuery);
        }

        private static string HashPayloadSha256Hex(object? body)
        {
            if (body == null)
            {
                return ComputeSha256Hex(Array.Empty<byte>());
            }

            byte[] bodyBytes;
            
            switch (body)
            {
                case byte[] bytes:
                    bodyBytes = bytes;
                    break;
                case string str:
                    bodyBytes = Encoding.UTF8.GetBytes(str);
                    break;
                default:
                    var json = JsonSerializer.Serialize(body);
                    bodyBytes = Encoding.UTF8.GetBytes(json);
                    break;
            }

            return ComputeSha256Hex(bodyBytes);
        }

        private static string ComputeSha256Hex(byte[] data)
        {
            using var sha256 = SHA256.Create();
            var hash = sha256.ComputeHash(data);
            return Convert.ToHexString(hash).ToLowerInvariant();
        }

        private static byte[] ComputeHmacSha256Raw(byte[] key, byte[] data)
        {
            using var hmac = new HMACSHA256(key);
            return hmac.ComputeHash(data);
        }

        private static string ComputeHmacSha256Hex(byte[] key, byte[] data)
        {
            var hash = ComputeHmacSha256Raw(key, data);
            return Convert.ToHexString(hash).ToLowerInvariant();
        }
    }
}