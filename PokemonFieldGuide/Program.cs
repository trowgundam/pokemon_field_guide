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
        AddChecklistProfileRules(builder.Services);

        await builder.Build().RunAsync();
    }

    internal static void AddChecklistProfileRules(IServiceCollection services)
    {
        services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("frlg"));
        services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("rb"));
        services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("yellow"));
        services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("gs"));
        services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("crystal"));
        services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("rs"));
        services.AddSingleton<IChecklistProfileRules>(new GamePackageChecklistProfileRules("emerald"));
    }
}
