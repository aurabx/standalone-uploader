using Xunit;

namespace Aura.UploaderClient.Tests;

public class AuraHmacSignerTests
{
    private const string TestAppId = "test-app-id";
    private const string TestAppSecret = "test-secret-key";

    [Fact]
    public void SignRequest_AddsRequiredHeaders()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "GET",
            BaseUrl = "https://aura.example.com",
            Url = "/api/uploader/config",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" }
            }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        Assert.True(request.Headers.ContainsKey("X-Aura-Timestamp"));
        Assert.True(request.Headers.ContainsKey("X-Aura-Nonce"));
        Assert.True(request.Headers.ContainsKey("Authorization"));
    }

    [Fact]
    public void SignRequest_AuthorizationHeader_HasCorrectFormat()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "GET",
            BaseUrl = "https://aura.example.com",
            Url = "/api/uploader/config",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" }
            }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        var authHeader = request.Headers["Authorization"];
        Assert.StartsWith("AURA-HMAC-SHA256 ", authHeader);
        Assert.Contains($"Credential={TestAppId},", authHeader);
        Assert.Contains("SignedHeaders=", authHeader);
        Assert.Contains("Signature=", authHeader);
    }

    [Fact]
    public void SignRequest_TimestampHeader_IsUnixTimestamp()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "GET",
            BaseUrl = "https://aura.example.com",
            Url = "/api/uploader/config",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" }
            }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        var timestamp = request.Headers["X-Aura-Timestamp"];
        Assert.True(long.TryParse(timestamp, out var unixTime));
        
        // Should be within last minute
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        Assert.InRange(unixTime, now - 60, now + 60);
    }

    [Fact]
    public void SignRequest_NonceHeader_IsValidGuid()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "GET",
            BaseUrl = "https://aura.example.com",
            Url = "/api/uploader/config",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" }
            }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        var nonce = request.Headers["X-Aura-Nonce"];
        Assert.True(Guid.TryParse(nonce, out _));
    }

    [Fact]
    public void SignRequest_PostWithBody_AddsContentTypeHeader()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "POST",
            BaseUrl = "https://aura.example.com",
            Url = "/api/auth/exchange",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" }
            },
            Body = new { ttl = 3600 }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        Assert.True(request.Headers.ContainsKey("Content-Type"));
        Assert.Equal("application/json", request.Headers["Content-Type"]);
    }

    [Fact]
    public void SignRequest_PostWithBody_IncludesContentTypeInSignedHeaders()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "POST",
            BaseUrl = "https://aura.example.com",
            Url = "/api/auth/exchange",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" },
                { "Content-Type", "application/json" }
            },
            Body = new { ttl = 3600 }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        var authHeader = request.Headers["Authorization"];
        Assert.Contains("content-type", authHeader);
    }

    [Fact]
    public void SignRequest_PreservesExistingContentType()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "POST",
            BaseUrl = "https://aura.example.com",
            Url = "/api/auth/exchange",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" },
                { "Content-Type", "application/xml" }
            },
            Body = "<request><ttl>3600</ttl></request>"
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        Assert.Equal("application/xml", request.Headers["Content-Type"]);
    }

    [Fact]
    public void SignRequest_DifferentNoncesProduceDifferentSignatures()
    {
        var request1 = new AuraHmacSigner.HttpRequest
        {
            Method = "GET",
            BaseUrl = "https://aura.example.com",
            Url = "/api/uploader/config",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" }
            }
        };

        var request2 = new AuraHmacSigner.HttpRequest
        {
            Method = "GET",
            BaseUrl = "https://aura.example.com",
            Url = "/api/uploader/config",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" }
            }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request1);
        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request2);

        var sig1 = ExtractSignature(request1.Headers["Authorization"]);
        var sig2 = ExtractSignature(request2.Headers["Authorization"]);

        Assert.NotEqual(sig1, sig2);
    }

    [Fact]
    public void SignRequest_GetWithoutBody_DoesNotAddContentType()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "GET",
            BaseUrl = "https://aura.example.com",
            Url = "/api/uploader/config",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" }
            }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        Assert.False(request.Headers.ContainsKey("Content-Type"));
    }

    [Theory]
    [InlineData("GET")]
    [InlineData("POST")]
    [InlineData("PUT")]
    [InlineData("PATCH")]
    [InlineData("DELETE")]
    public void SignRequest_SupportsAllHttpMethods(string method)
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = method,
            BaseUrl = "https://aura.example.com",
            Url = "/api/uploader/config",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" }
            }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        Assert.True(request.Headers.ContainsKey("Authorization"));
    }

    [Fact]
    public void SignRequest_WithQueryParameters_IncludesInSignature()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "GET",
            BaseUrl = "https://aura.example.com",
            Url = "/api/uploader/config?param=value",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" }
            }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        Assert.True(request.Headers.ContainsKey("Authorization"));
    }

    [Fact]
    public void SignRequest_WithQueryMap_IncludesInSignature()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "GET",
            BaseUrl = "https://aura.example.com",
            Url = "/api/uploader/config",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" }
            },
            Query = new Dictionary<string, object>
            {
                { "param1", "value1" },
                { "param2", "value2" }
            }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        Assert.True(request.Headers.ContainsKey("Authorization"));
    }

    [Fact]
    public void SignRequest_SignedHeadersAreSorted()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "POST",
            BaseUrl = "https://aura.example.com",
            Url = "/api/auth/exchange",
            Headers = new Dictionary<string, string>
            {
                { "Host", "aura.example.com" },
                { "Content-Type", "application/json" }
            },
            Body = new { ttl = 3600 }
        };

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        var authHeader = request.Headers["Authorization"];
        var signedHeadersMatch = System.Text.RegularExpressions.Regex.Match(authHeader, @"SignedHeaders=([^,]+),");
        Assert.True(signedHeadersMatch.Success);
        
        var signedHeaders = signedHeadersMatch.Groups[1].Value.Split(';');
        var sortedHeaders = signedHeaders.OrderBy(h => h, StringComparer.OrdinalIgnoreCase).ToArray();
        Assert.Equal(sortedHeaders, signedHeaders);
    }

    [Fact]
    public void SignRequest_NullHeaders_InitializesHeaders()
    {
        var request = new AuraHmacSigner.HttpRequest
        {
            Method = "GET",
            BaseUrl = "https://aura.example.com",
            Url = "/api/uploader/config"
        };
        request.Headers = null!;

        AuraHmacSigner.SignRequest(TestAppId, TestAppSecret, request);

        Assert.NotNull(request.Headers);
        Assert.True(request.Headers.ContainsKey("Authorization"));
    }

    private static string ExtractSignature(string authHeader)
    {
        var match = System.Text.RegularExpressions.Regex.Match(authHeader, @"Signature=([a-f0-9]+)");
        return match.Success ? match.Groups[1].Value : string.Empty;
    }
}
