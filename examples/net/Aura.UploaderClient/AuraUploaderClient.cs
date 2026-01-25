using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace Aura.UploaderClient
{
    /// <summary>
    /// Client for the Aura Uploader API, covering auth and manage endpoints.
    /// </summary>
    public class AuraUploaderClient : IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly AuraClientOptions _options;
        private readonly bool _disposeHttpClient;
        private string? _accessToken;
        private DateTimeOffset _tokenExpiry = DateTimeOffset.MinValue;

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        public AuraUploaderClient(AuraClientOptions options) : this(options, new HttpClient(), true)
        {
        }

        public AuraUploaderClient(AuraClientOptions options, HttpClient httpClient, bool disposeHttpClient = false)
        {
            _options = options ?? throw new ArgumentNullException(nameof(options));
            _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
            _disposeHttpClient = disposeHttpClient;
            
            _httpClient.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
        }

        #region Auth Endpoints

        /// <summary>
        /// Exchange HMAC credentials for a bearer token.
        /// POST /api/auth/exchange
        /// </summary>
        public async Task<TokenExchangeResponse> ExchangeTokenAsync(
            TokenExchangeRequest request,
            CancellationToken cancellationToken = default)
        {
            var httpRequest = CreateSignedRequest(HttpMethod.Post, "api/auth/exchange", request);
            return await SendAsync<TokenExchangeResponse>(httpRequest, cancellationToken);
        }

        /// <summary>
        /// Ensures a valid access token is available, refreshing if necessary.
        /// </summary>
        public async Task<string> EnsureAuthenticatedAsync(CancellationToken cancellationToken = default)
        {
            if (!string.IsNullOrEmpty(_accessToken) && DateTimeOffset.UtcNow < _tokenExpiry.AddMinutes(-1))
            {
                return _accessToken;
            }

            var response = await ExchangeTokenAsync(new TokenExchangeRequest
            {
                Ttl = _options.TokenTtl,
                Scopes = _options.DefaultScopes
            }, cancellationToken);

            _accessToken = response.AccessToken;
            _tokenExpiry = DateTimeOffset.UtcNow.AddSeconds(response.ExpiresIn);

            return _accessToken;
        }

        #endregion

        #region Manage Endpoints

        /// <summary>
        /// Submit an upload for processing.
        /// POST /api/uploader/manage/submit
        /// </summary>
        public async Task<SubmitResponse> SubmitAsync(
            SubmitRequest request,
            CancellationToken cancellationToken = default)
        {
            await EnsureAuthenticatedAsync(cancellationToken);
            var httpRequest = CreateAuthenticatedRequest(HttpMethod.Post, "api/uploader/manage/submit", request);
            return await SendAsync<SubmitResponse>(httpRequest, cancellationToken);
        }

        /// <summary>
        /// Withdraw a previously submitted upload.
        /// POST /api/uploader/manage/withdraw
        /// </summary>
        public async Task<WithdrawResponse> WithdrawAsync(
            WithdrawRequest request,
            CancellationToken cancellationToken = default)
        {
            await EnsureAuthenticatedAsync(cancellationToken);
            var httpRequest = CreateAuthenticatedRequest(HttpMethod.Post, "api/uploader/manage/withdraw", request);
            return await SendAsync<WithdrawResponse>(httpRequest, cancellationToken);
        }

        #endregion

        #region Private Methods

        private HttpRequestMessage CreateSignedRequest<TBody>(HttpMethod method, string path, TBody body)
        {
            var request = new AuraHmacSigner.HttpRequest
            {
                Method = method.Method,
                BaseUrl = _options.BaseUrl,
                Url = "/" + path,
                Headers = new Dictionary<string, string>
                {
                    { "Host", new Uri(_options.BaseUrl).Host },
                    { "Content-Type", "application/json" },
                    { "X-Api-Key", _options.ApiKey }
                },
                Body = body
            };

            AuraHmacSigner.SignRequest(_options.AppId, _options.AppSecret, request);

            var httpRequest = new HttpRequestMessage(method, path);
            
            if (body != null)
            {
                var json = JsonSerializer.Serialize(body, JsonOptions);
                httpRequest.Content = new StringContent(json, Encoding.UTF8, "application/json");
            }

            foreach (var header in request.Headers)
            {
                if (!header.Key.Equals("Host", StringComparison.OrdinalIgnoreCase) &&
                    !header.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase))
                {
                    httpRequest.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }
            }

            return httpRequest;
        }

        private HttpRequestMessage CreateAuthenticatedRequest<TBody>(HttpMethod method, string path, TBody body)
        {
            var httpRequest = new HttpRequestMessage(method, path);
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

            if (body != null)
            {
                var json = JsonSerializer.Serialize(body, JsonOptions);
                httpRequest.Content = new StringContent(json, Encoding.UTF8, "application/json");
            }

            return httpRequest;
        }

        private async Task<TResponse> SendAsync<TResponse>(
            HttpRequestMessage request, 
            CancellationToken cancellationToken)
        {
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            
            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                throw new AuraApiException(
                    $"API request failed with status {(int)response.StatusCode}: {content}",
                    response.StatusCode,
                    content);
            }

            var result = JsonSerializer.Deserialize<TResponse>(content, JsonOptions);
            return result ?? throw new AuraApiException("Failed to deserialize response", response.StatusCode, content);
        }

        #endregion

        public void Dispose()
        {
            if (_disposeHttpClient)
            {
                _httpClient.Dispose();
            }
        }
    }

    #region Options

    public class AuraClientOptions
    {
        public required string BaseUrl { get; set; }
        public required string AppId { get; set; }
        public required string AppSecret { get; set; }
        public required string ApiKey { get; set; }
        public int TokenTtl { get; set; } = 3600;
        public string[] DefaultScopes { get; set; } = { "upload:init", "upload:manage", "integration:read" };
    }

    #endregion

    #region Request/Response Models

    public class TokenExchangeRequest
    {
        public int Ttl { get; set; } = 3600;
        public string[]? Scopes { get; set; }
    }

    public class TokenExchangeResponse
    {
        [JsonPropertyName("access_token")]
        public string AccessToken { get; set; } = string.Empty;

        [JsonPropertyName("token_type")]
        public string TokenType { get; set; } = string.Empty;

        [JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }

        [JsonPropertyName("scopes")]
        public string[]? Scopes { get; set; }
    }

    public class SubmitRequest
    {
        [JsonPropertyName("upload_id")]
        public required string UploadId { get; set; }

        [JsonPropertyName("metadata")]
        public Dictionary<string, object>? Metadata { get; set; }
    }

    public class SubmitResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("upload_id")]
        public string UploadId { get; set; } = string.Empty;

        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    public class WithdrawRequest
    {
        [JsonPropertyName("upload_id")]
        public required string UploadId { get; set; }

        [JsonPropertyName("reason")]
        public string? Reason { get; set; }
    }

    public class WithdrawResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("upload_id")]
        public string UploadId { get; set; } = string.Empty;

        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    #endregion

    #region Exceptions

    public class AuraApiException : Exception
    {
        public System.Net.HttpStatusCode StatusCode { get; }
        public string ResponseContent { get; }

        public AuraApiException(string message, System.Net.HttpStatusCode statusCode, string responseContent)
            : base(message)
        {
            StatusCode = statusCode;
            ResponseContent = responseContent;
        }
    }

    #endregion
}
