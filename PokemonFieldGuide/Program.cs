using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

using PokemonFieldGuide.Services;

namespace PokemonFieldGuide;

public class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebAssemblyHostBuilder.CreateDefault(args);
        builder.RootComponents.Add<App>("#app");
        builder.RootComponents.Add<HeadOutlet>("head::after");

        builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
        builder.Services.AddScoped<GamePackageLoader>();
        builder.Services.AddScoped<ILocalGuideStorage, BrowserLocalGuideStorage>();
        builder.Services.AddScoped<LocalGuideStateModule>();
        builder.Services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("frlg"));
        builder.Services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("rb"));
        builder.Services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("yellow"));
        builder.Services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("gs"));
        builder.Services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("crystal"));

        await builder.Build().RunAsync();
    }
}
