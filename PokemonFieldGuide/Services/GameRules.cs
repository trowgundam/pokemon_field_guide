using PokemonFieldGuide.Models;

namespace PokemonFieldGuide.Services;

internal interface IGameRules
{
    string NormalizeAreaId(string id);
    string EncounterGroupName(Encounter encounter);
    int EncounterGroupOrder(string name);
    int SpecialGroupOrder(string kind);
    int ItemGroupOrder(string kind);
    string PokemonSpriteName(string speciesId);
    string? EmbeddedPokemonIcon(string speciesId);
}

internal sealed class GameRulesRegistry(IEnumerable<IGameRulesProvider> providers)
{
    public IGameRules Get(string id) => providers.FirstOrDefault(provider => provider.Id == id)?.Rules
        ?? throw new InvalidOperationException($"No rules module is registered for '{id}'.");
}

internal interface IGameRulesProvider
{
    string Id { get; }
    IGameRules Rules { get; }
}

internal sealed class FrlgGameRulesProvider : IGameRulesProvider
{
    public string Id => "frlg";
    public IGameRules Rules { get; } = new FrlgGameRules();
}

internal sealed class RbGameRulesProvider : IGameRulesProvider
{
    public string Id => "rb";
    public IGameRules Rules { get; } = new RbGameRules();
}

internal sealed class YellowGameRulesProvider : IGameRulesProvider
{
    public string Id => "yellow";
    public IGameRules Rules { get; } = new RbGameRules();
}

internal sealed class RbGameRules : IGameRules
{
    public string NormalizeAreaId(string id) => id;
    public string EncounterGroupName(Encounter encounter) => encounter.Method switch
    {
        "Grass / cave" => "Random encounters",
        "Surf" => "Surfing",
        "Old Rod" => "Fishing · Old Rod",
        "Good Rod" => "Fishing · Good Rod",
        "Super Rod" => "Fishing · Super Rod",
        _ => encounter.Method
    };
    public int EncounterGroupOrder(string name) => name switch
    {
        "Random encounters" => 0, "Surfing" => 1, "Fishing · Old Rod" => 2,
        "Fishing · Good Rod" => 3, "Fishing · Super Rod" => 4, _ => 5
    };
    public int SpecialGroupOrder(string kind) => kind switch { "Static" => 0, "Gift" => 1, "Trade" => 2, _ => 3 };
    public int ItemGroupOrder(string kind) => kind switch { "Visible" => 0, "Hidden" => 1, "Event" => 2, _ => 3 };
    public string PokemonSpriteName(string speciesId) => speciesId switch
    {
        "SPECIES_NIDORAN_F" => "nidoranf.png",
        "SPECIES_NIDORAN_M" => "nidoranm.png",
        "SPECIES_MR_MIME" => "mr.mime.png",
        _ => speciesId.Replace("SPECIES_", "").ToLowerInvariant() + ".png"
    };
    public string? EmbeddedPokemonIcon(string speciesId) => null;
}

internal sealed class FrlgGameRules : IGameRules
{
    private const string UnownIcon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAABABAMAAACJoGidAAAAMFBMVEVinIODg3O9vb3///+9pEH29inVYkH2lCmLe/9iSs3uc5z/tKSkxf9qrJxiYlpBQUFZqZBkAAAAAXRSTlMAQObYZgAAAHNJREFUOI3t0rENgCAQBdCbgAsLQNBeE+xx/y0EexQdAGPn/cLOxBh/x8sdUHyil6fCmd0KoAGqlTvsciNGSvKpF9AOnRUQ5gCwA4wAjHfw5hfxLNtcAAihSkhGR/HTOOVsJJC6B0UAZyaE7+QvzBWeLswBavhUhdC+umYAAAAASUVORK5CYII=";

    public string NormalizeAreaId(string id) => id == "MAP_SAFFRON_CITY_CONNECTION" ? "MAP_SAFFRON_CITY" : id;

    public string EncounterGroupName(Encounter encounter) => encounter.Method.StartsWith("Roaming", StringComparison.Ordinal)
        ? "Roaming encounters"
        : encounter.Method switch
        {
            "Grass / cave" => "Random encounters",
            "Surf" => "Surfing",
            "Old Rod" => "Fishing · Old Rod",
            "Good Rod" => "Fishing · Good Rod",
            "Super Rod" => "Fishing · Super Rod",
            _ => encounter.Method
        };

    public int EncounterGroupOrder(string name) => name switch
    {
        "Random encounters" => 0,
        "Surfing" => 1,
        "Fishing · Old Rod" => 2,
        "Fishing · Good Rod" => 3,
        "Fishing · Super Rod" => 4,
        "Roaming encounters" => 5,
        "Rock Smash" => 6,
        _ => 7
    };

    public int SpecialGroupOrder(string kind) => kind switch { "Static" => 0, "Gift" => 1, "Trade" => 2, _ => 3 };
    public int ItemGroupOrder(string kind) => kind switch { "Visible" => 0, "Hidden" => 1, "Event" => 2, _ => 3 };
    public string PokemonSpriteName(string speciesId) => speciesId.Replace("SPECIES_", "").ToLowerInvariant() + ".png";

    public string? EmbeddedPokemonIcon(string speciesId) => speciesId == "SPECIES_UNOWN" ? UnownIcon : null;
}
