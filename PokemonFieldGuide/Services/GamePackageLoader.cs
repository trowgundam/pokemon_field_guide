using System.Net.Http.Json;
using PokemonFieldGuide.Models;

namespace PokemonFieldGuide.Services;

public sealed class GamePackageLoader(HttpClient http)
{
    public async Task<GameCatalog> LoadCatalogAsync() =>
        await http.GetFromJsonAsync<GameCatalog>("games/catalog.json")
        ?? throw new InvalidOperationException("The game catalog could not be loaded.");

    public async Task<LoadedGamePackage> LoadAsync(GameDefinition definition)
    {
        var fieldGuideTask = http.GetFromJsonAsync<FieldGuideData>(definition.DataPath);
        var pokedexTask = http.GetFromJsonAsync<List<PokedexEntry>>(definition.PokedexPath);
        var worldsTask = http.GetFromJsonAsync<List<GuideWorld>>(definition.WorldsPath);
        await Task.WhenAll(fieldGuideTask, pokedexTask, worldsTask);

        return new LoadedGamePackage(
            definition,
            await fieldGuideTask ?? throw new InvalidOperationException($"Field-guide data for {definition.Name} could not be loaded."),
            await pokedexTask ?? [],
            await worldsTask ?? []);
    }
}
