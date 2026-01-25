using System.Net;
using System.Text.Json;
using Xunit;

namespace Aura.UploaderClient.Tests;

public class AuraUploaderClientTests
{
    private static AuraClientOptions CreateTestOptions() => new()
    {
        BaseUrl = "https://aura.example.com",
        AppId = "test-app-id",
        AppSecret = "test-secret-key",
        ApiKey = "test-api-key"
    };

    [Fact]
    public void Constructor_WithValidOptions_CreatesClient()
    {
        var options = CreateTestOptions();

        using var client = new AuraUploaderClient(options);

        Assert.NotNull(client);
    }

    [Fact]
    public void Constructor_WithNullOptions_ThrowsArgumentNullException()
    {
        Assert.Throws<ArgumentNullException>(() => new AuraUploaderClient(null!));
    }

    [Fact]
    public void Constructor_WithCustomHttpClient_UsesProvidedClient()
    {
        var options = CreateTestOptions();
        var httpClient = new HttpClient();

        using var client = new AuraUploaderClient(options, httpClient, disposeHttpClient: false);

        Assert.NotNull(client);
    }

    [Fact]
    public void AuraClientOptions_DefaultValues_AreCorrect()
    {
        var options = new AuraClientOptions
        {
            BaseUrl = "https://example.com",
            AppId = "app",
            AppSecret = "secret",
            ApiKey = "key"
        };

        Assert.Equal(3600, options.TokenTtl);
        Assert.Equal(new[] { "upload:init", "upload:manage", "integration:read" }, options.DefaultScopes);
    }

    [Fact]
    public void TokenExchangeRequest_DefaultValues_AreCorrect()
    {
        var request = new TokenExchangeRequest();

        Assert.Equal(3600, request.Ttl);
        Assert.Null(request.Scopes);
    }

    [Fact]
    public void TokenExchangeResponse_Deserializes_Correctly()
    {
        var json = """
        {
            "access_token": "test-token-123",
            "token_type": "Bearer",
            "expires_in": 3600,
            "scopes": ["upload:init", "upload:manage"]
        }
        """;

        var response = JsonSerializer.Deserialize<TokenExchangeResponse>(json);

        Assert.NotNull(response);
        Assert.Equal("test-token-123", response.AccessToken);
        Assert.Equal("Bearer", response.TokenType);
        Assert.Equal(3600, response.ExpiresIn);
        Assert.Equal(new[] { "upload:init", "upload:manage" }, response.Scopes);
    }

    [Fact]
    public void SubmitRequest_Serializes_WithSnakeCase()
    {
        var request = new SubmitRequest
        {
            UploadId = "upload-123",
            Metadata = new Dictionary<string, object>
            {
                { "patient_id", "12345" }
            }
        };

        var json = JsonSerializer.Serialize(request, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
        });

        Assert.Contains("\"upload_id\"", json);
        Assert.Contains("\"upload-123\"", json);
    }

    [Fact]
    public void SubmitResponse_Deserializes_Correctly()
    {
        var json = """
        {
            "success": true,
            "upload_id": "upload-123",
            "status": "submitted",
            "message": "Upload submitted successfully"
        }
        """;

        var response = JsonSerializer.Deserialize<SubmitResponse>(json);

        Assert.NotNull(response);
        Assert.True(response.Success);
        Assert.Equal("upload-123", response.UploadId);
        Assert.Equal("submitted", response.Status);
        Assert.Equal("Upload submitted successfully", response.Message);
    }

    [Fact]
    public void WithdrawRequest_Serializes_WithSnakeCase()
    {
        var request = new WithdrawRequest
        {
            UploadId = "upload-123",
            Reason = "Duplicate"
        };

        var json = JsonSerializer.Serialize(request, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
        });

        Assert.Contains("\"upload_id\"", json);
        Assert.Contains("\"reason\"", json);
    }

    [Fact]
    public void WithdrawResponse_Deserializes_Correctly()
    {
        var json = """
        {
            "success": true,
            "upload_id": "upload-123",
            "status": "withdrawn",
            "message": "Upload withdrawn successfully"
        }
        """;

        var response = JsonSerializer.Deserialize<WithdrawResponse>(json);

        Assert.NotNull(response);
        Assert.True(response.Success);
        Assert.Equal("upload-123", response.UploadId);
        Assert.Equal("withdrawn", response.Status);
        Assert.Equal("Upload withdrawn successfully", response.Message);
    }

    [Fact]
    public void AuraApiException_ContainsStatusCodeAndContent()
    {
        var exception = new AuraApiException(
            "Test error",
            HttpStatusCode.BadRequest,
            "{\"error\": \"invalid request\"}");

        Assert.Equal("Test error", exception.Message);
        Assert.Equal(HttpStatusCode.BadRequest, exception.StatusCode);
        Assert.Equal("{\"error\": \"invalid request\"}", exception.ResponseContent);
    }

    [Fact]
    public void Dispose_DisposesOwnedHttpClient()
    {
        var options = CreateTestOptions();
        var client = new AuraUploaderClient(options);

        // Should not throw
        client.Dispose();
    }

    [Fact]
    public void Dispose_DoesNotDisposeExternalHttpClient()
    {
        var options = CreateTestOptions();
        var httpClient = new HttpClient();

        var client = new AuraUploaderClient(options, httpClient, disposeHttpClient: false);
        client.Dispose();

        // HttpClient should still be usable
        Assert.NotNull(httpClient.BaseAddress);
    }
}
