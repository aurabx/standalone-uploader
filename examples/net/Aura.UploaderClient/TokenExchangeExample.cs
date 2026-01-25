using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Aura.UploaderClient;

namespace Aura.UploaderClient.Examples
{
    public class TokenExchangeExample
    {
        public static async Task<string> ExchangeTokenAsync(string appId, string appSecret, string apiKey, string auraApiUrl)
        {
            var request = new AuraHmacSigner.HttpRequest
            {
                Method = "POST",
                BaseUrl = auraApiUrl,
                Url = "/api/auth/exchange",
                Headers = new Dictionary<string, string>
                {
                    { "X-Api-Key", apiKey },
                    { "Host", new Uri(auraApiUrl).Host },
                    { "Content-Type", "application/json" }
                },
                Body = new
                {
                    ttl = 3600,
                    scopes = new[] { "upload:init", "upload:manage", "integration:read" }
                }
            };

            // Sign the request
            AuraHmacSigner.SignRequest(appId, appSecret, request);

            // Create HTTP request with signed headers
            using var httpClient = new HttpClient();
            var httpRequest = new HttpRequestMessage
            {
                Method = new HttpMethod(request.Method),
                RequestUri = new Uri(new Uri(request.BaseUrl), request.Url),
                Content = request.Body != null ? 
                    new StringContent(JsonSerializer.Serialize(request.Body), System.Text.Encoding.UTF8, "application/json") : 
                    null
            };

            // Copy headers
            foreach (var header in request.Headers)
            {
                if (!header.Key.Equals("Host", StringComparison.OrdinalIgnoreCase))
                {
                    httpRequest.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }
            }

            // Send request
            var response = await httpClient.SendAsync(httpRequest);
            response.EnsureSuccessStatusCode();

            var responseContent = await response.Content.ReadAsStringAsync();
            return responseContent;
        }

        public static async Task RunExample()
        {
            // Example credentials - in production, load from environment variables or secure config
            var appId = Environment.GetEnvironmentVariable("AURA_APP_ID") ?? "test-app-id";
            var appSecret = Environment.GetEnvironmentVariable("AURA_APP_SECRET") ?? "test-secret-key";
            var apiKey = Environment.GetEnvironmentVariable("AURA_API_KEY") ?? "test-api-key";
            var auraApiUrl = Environment.GetEnvironmentVariable("AURA_API_URL") ?? "https://aura.example.com";

            try
            {
                var tokenResponse = await ExchangeTokenAsync(appId, appSecret, apiKey, auraApiUrl);
                Console.WriteLine("Token exchange successful:");
                Console.WriteLine(tokenResponse);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Token exchange failed: {ex.Message}");
                throw;
            }
        }
    }
}