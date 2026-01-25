using Aura.UploaderClient.Examples;

namespace Aura.UploaderClient
{
    class Program
    {
        static async Task Main(string[] args)
        {
            Console.WriteLine("Aura Uploader API .NET Client");
            Console.WriteLine("=============================");

            try
            {
                // Demonstrate the low-level token exchange
                Console.WriteLine("\n1. Low-level token exchange example...");
                await TokenExchangeExample.RunExample();

                // Demonstrate the high-level client
                Console.WriteLine("\n2. High-level client example...");
                await RunClientExample();

                Console.WriteLine("\nAll examples completed successfully!");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"\nError: {ex.Message}");
                Environment.Exit(1);
            }
        }

        static async Task RunClientExample()
        {
            // Load configuration from environment variables
            var options = new AuraClientOptions
            {
                BaseUrl = Environment.GetEnvironmentVariable("AURA_API_URL") ?? "https://aura.example.com",
                AppId = Environment.GetEnvironmentVariable("AURA_APP_ID") ?? "test-app-id",
                AppSecret = Environment.GetEnvironmentVariable("AURA_APP_SECRET") ?? "test-secret-key",
                ApiKey = Environment.GetEnvironmentVariable("AURA_API_KEY") ?? "test-api-key"
            };

            using var client = new AuraUploaderClient(options);

            // Example: Exchange token
            Console.WriteLine("  Exchanging token...");
            var tokenResponse = await client.ExchangeTokenAsync(new TokenExchangeRequest
            {
                Ttl = 3600,
                Scopes = new[] { "upload:init", "upload:manage" }
            });
            Console.WriteLine($"  Token received: {tokenResponse.AccessToken[..20]}...");
            Console.WriteLine($"  Expires in: {tokenResponse.ExpiresIn} seconds");

            // Example: Submit an upload (would need a real upload_id)
            // var submitResponse = await client.SubmitAsync(new SubmitRequest
            // {
            //     UploadId = "your-upload-id",
            //     Metadata = new Dictionary<string, object>
            //     {
            //         { "patient_id", "12345" },
            //         { "study_type", "CT" }
            //     }
            // });

            // Example: Withdraw an upload
            // var withdrawResponse = await client.WithdrawAsync(new WithdrawRequest
            // {
            //     UploadId = "your-upload-id",
            //     Reason = "Duplicate upload"
            // });

            Console.WriteLine("  Client example completed.");
        }
    }
}