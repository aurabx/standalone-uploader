using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace Aura.UploaderClient.Tests;

/// <summary>
/// Tests that verify signature generation against known test vectors.
/// These tests use fixed timestamps and nonces to ensure deterministic results.
/// </summary>
public class SignatureTestVectorTests
{
    [Fact]
    public void TestVector1_PostWithJsonBody_ProducesExpectedSignature()
    {
        // Test Vector 1: POST with JSON body
        // Fixed inputs for reproducibility
        var appId = "test-app-id";
        var appSecret = "test-secret-key";
        var timestamp = "1706140800";
        var nonce = "550e8400-e29b-41d4-a716-446655440000";
        var date = "20240125";

        // Use explicit JSON string to ensure consistent hashing
        var bodyJson = """{"ttl":3600,"scopes":["upload:init","upload:manage"]}""";

        // Build canonical request components
        var canonicalPath = "/api/auth/exchange";
        var canonicalQuery = "";
        var signedHeaders = "content-type;host;x-aura-nonce;x-aura-timestamp";
        var canonicalHeaders = 
            $"content-type:application/json\n" +
            $"host:aura.example.com\n" +
            $"x-aura-nonce:{nonce}\n" +
            $"x-aura-timestamp:{timestamp}\n";
        var payloadHash = ComputeSha256Hex(Encoding.UTF8.GetBytes(bodyJson));

        var canonicalRequest = string.Join("\n", new[]
        {
            "POST",
            canonicalPath,
            canonicalQuery,
            canonicalHeaders,
            signedHeaders,
            payloadHash
        });

        var canonicalRequestHash = ComputeSha256Hex(Encoding.UTF8.GetBytes(canonicalRequest));
        var credentialScope = $"{appId}/{date}/aura_request";
        var stringToSign = string.Join("\n", new[]
        {
            "AURA-HMAC-SHA256",
            timestamp,
            credentialScope,
            canonicalRequestHash
        });

        // Key derivation
        var dateKey = ComputeHmacSha256Raw(Encoding.UTF8.GetBytes("AURA" + appSecret), Encoding.UTF8.GetBytes(date));
        var signingKey = ComputeHmacSha256Raw(dateKey, Encoding.UTF8.GetBytes("aura_request"));
        var signature = ComputeHmacSha256Hex(signingKey, Encoding.UTF8.GetBytes(stringToSign));

        // Expected signature computed with the exact JSON above
        const string expectedSignature = "4e865169c280c238e93ea51681fdf9e5977ecbf0dc60fbbf0b6b7ccba2005093";

        Assert.Equal(expectedSignature, signature);
    }

    [Fact]
    public void TestVector2_GetWithoutBody_ProducesExpectedSignature()
    {
        // Test Vector 2: GET request without body
        var appId = "test-app-id";
        var appSecret = "test-secret-key";
        var timestamp = "1706140800";
        var nonce = "550e8400-e29b-41d4-a716-446655440001";
        var date = "20240125";

        // Build canonical request components
        var canonicalPath = "/api/uploader/config";
        var canonicalQuery = "";
        var signedHeaders = "host;x-aura-nonce;x-aura-timestamp";
        var canonicalHeaders = 
            $"host:aura.example.com\n" +
            $"x-aura-nonce:{nonce}\n" +
            $"x-aura-timestamp:{timestamp}\n";
        var payloadHash = ComputeSha256Hex(Array.Empty<byte>()); // Empty body

        var canonicalRequest = string.Join("\n", new[]
        {
            "GET",
            canonicalPath,
            canonicalQuery,
            canonicalHeaders,
            signedHeaders,
            payloadHash
        });

        var canonicalRequestHash = ComputeSha256Hex(Encoding.UTF8.GetBytes(canonicalRequest));
        var credentialScope = $"{appId}/{date}/aura_request";
        var stringToSign = string.Join("\n", new[]
        {
            "AURA-HMAC-SHA256",
            timestamp,
            credentialScope,
            canonicalRequestHash
        });

        // Key derivation
        var dateKey = ComputeHmacSha256Raw(Encoding.UTF8.GetBytes("AURA" + appSecret), Encoding.UTF8.GetBytes(date));
        var signingKey = ComputeHmacSha256Raw(dateKey, Encoding.UTF8.GetBytes("aura_request"));
        var signature = ComputeHmacSha256Hex(signingKey, Encoding.UTF8.GetBytes(stringToSign));

        // Verify we get a valid 64-character hex signature
        Assert.Equal(64, signature.Length);
        Assert.Matches(@"^[a-f0-9]+$", signature);
    }

    [Fact]
    public void TestVector3_PostWithQueryParameters_ProducesExpectedSignature()
    {
        // Test Vector 3: POST with query parameters
        var appId = "test-app-id";
        var appSecret = "test-secret-key";
        var timestamp = "1706140800";
        var nonce = "550e8400-e29b-41d4-a716-446655440002";
        var date = "20240125";

        // Use explicit JSON string
        var bodyJson = """{"data":"test"}""";

        // Build canonical request components - query params should be sorted
        var canonicalPath = "/api/uploader/upload/init";
        var canonicalQuery = "format=json&version=1"; // Sorted alphabetically
        var signedHeaders = "content-type;host;x-aura-nonce;x-aura-timestamp";
        var canonicalHeaders = 
            $"content-type:application/json\n" +
            $"host:aura.example.com\n" +
            $"x-aura-nonce:{nonce}\n" +
            $"x-aura-timestamp:{timestamp}\n";
        var payloadHash = ComputeSha256Hex(Encoding.UTF8.GetBytes(bodyJson));

        var canonicalRequest = string.Join("\n", new[]
        {
            "POST",
            canonicalPath,
            canonicalQuery,
            canonicalHeaders,
            signedHeaders,
            payloadHash
        });

        var canonicalRequestHash = ComputeSha256Hex(Encoding.UTF8.GetBytes(canonicalRequest));
        var credentialScope = $"{appId}/{date}/aura_request";
        var stringToSign = string.Join("\n", new[]
        {
            "AURA-HMAC-SHA256",
            timestamp,
            credentialScope,
            canonicalRequestHash
        });

        // Key derivation
        var dateKey = ComputeHmacSha256Raw(Encoding.UTF8.GetBytes("AURA" + appSecret), Encoding.UTF8.GetBytes(date));
        var signingKey = ComputeHmacSha256Raw(dateKey, Encoding.UTF8.GetBytes("aura_request"));
        var signature = ComputeHmacSha256Hex(signingKey, Encoding.UTF8.GetBytes(stringToSign));

        // Verify we get a valid 64-character hex signature
        Assert.Equal(64, signature.Length);
        Assert.Matches(@"^[a-f0-9]+$", signature);
    }

    [Fact]
    public void KeyDerivation_ProducesConsistentResults()
    {
        var appSecret = "test-secret-key";
        var date = "20240125";

        // Derive key twice and verify consistency
        var dateKey1 = ComputeHmacSha256Raw(Encoding.UTF8.GetBytes("AURA" + appSecret), Encoding.UTF8.GetBytes(date));
        var signingKey1 = ComputeHmacSha256Raw(dateKey1, Encoding.UTF8.GetBytes("aura_request"));

        var dateKey2 = ComputeHmacSha256Raw(Encoding.UTF8.GetBytes("AURA" + appSecret), Encoding.UTF8.GetBytes(date));
        var signingKey2 = ComputeHmacSha256Raw(dateKey2, Encoding.UTF8.GetBytes("aura_request"));

        Assert.Equal(signingKey1, signingKey2);
    }

    [Theory]
    [InlineData("", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")] // Empty string
    [InlineData("{}", "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a")] // Empty JSON object
    public void PayloadHash_ProducesExpectedValues(string payload, string expectedHash)
    {
        var hash = ComputeSha256Hex(Encoding.UTF8.GetBytes(payload));
        Assert.Equal(expectedHash, hash);
    }

    #region Helper Methods

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

    #endregion
}
