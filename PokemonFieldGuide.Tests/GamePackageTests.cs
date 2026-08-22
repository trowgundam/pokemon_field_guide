using System.Net;
using System.Text;
using System.Text.Json;

using PokemonFieldGuide.Services;

using Xunit;

namespace PokemonFieldGuide.Tests;

public sealed class GamePackageTests
{
    [Fact]
    public async Task SearchAreas_matches_package_contents_for_the_selected_version()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.AddRange([
            Area("ROUTE_10", "Route 10", encounters: [Encounter("Pikachu", "SPECIES_PIKACHU", "Surf", "Red")]),
            Area("ROUTE_2", "Route 2", items: [Item("Potion", "Visible")]),
            Area("BLUE_ONLY", "Blue Cave", encounters: [Encounter("Pikachu", "SPECIES_PIKACHU", "Surf", "Blue")])
        ]);
        fixture.Worlds.Add(World("world", "ROUTE_2"));
        var package = await fixture.LoadAsync();

        var pikachuAreas = package.SearchAreas("Pikachu", "Red");
        var routeAreas = package.SearchAreas("Route", "Red");

        Assert.Equal(["ROUTE_10"], pikachuAreas.Select(area => area.Id));
        Assert.Equal(["ROUTE_2", "ROUTE_10"], routeAreas.Select(area => area.Id));
    }

    [Fact]
    public async Task RelevantEntrances_traverses_empty_areas_and_clusters_adjacent_warps()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.AddRange([
            Area("OUT", "Outside", entrances:
            [
                Entrance("OUT:1", "EMPTY", 1, 1),
                Entrance("OUT:2", "EMPTY", 2, 1)
            ]),
            Area("EMPTY", "Hallway", entrances: [Entrance("EMPTY:1", "INNER", 0, 0)]),
            Area("INNER", "Interior", items: [Item("Potion", "Visible")])
        ]);
        fixture.Worlds.Add(World("world", "OUT"));
        var package = await fixture.LoadAsync();

        var entrance = Assert.Single(package.RelevantEntrances(package.Area("OUT")!));

        Assert.Equal("INNER", entrance.TargetId);
        Assert.Equal("Interior", entrance.Name);
        Assert.Equal(1.5, entrance.X);
        Assert.Equal(1, entrance.Y);
    }

    [Fact]
    public async Task RelevantEntrances_keeps_an_area_with_only_renewable_resources()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.AddRange([
            Area("OUT", "Outside", entrances: [Entrance("OUT:1", "GROVE", 1, 1)]),
            Area("GROVE", "Grove", resources: [new GuideMapResource { Name = "Honey", Kind = "Weekly renewable pickup", X = 2, Y = 3 }])
        ]);
        fixture.Worlds.Add(World("world", "OUT"));
        var package = await fixture.LoadAsync();

        var entrance = Assert.Single(package.RelevantEntrances(package.Area("OUT")!));

        Assert.Equal("GROVE", entrance.TargetId);
    }

    [Fact]
    public async Task InteriorFloors_omits_empty_connectors_but_traverses_through_them()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.AddRange([
            Area("OUT", "Outside", entrances: [Entrance("OUT:1", "ROOM_2", 0, 0)]),
            Area("ROOM_2", "Room 2", items: [Item("Potion", "Visible")], entrances: [Entrance("ROOM_2:1", "EMPTY", 0, 0)]),
            Area("EMPTY", "Hallway", entrances: [Entrance("EMPTY:1", "ROOM_10", 0, 0)]),
            Area("ROOM_10", "Room 10", special: [Special("Gift", "SPECIES_EEVEE", "Gift", "Both")])
        ]);
        fixture.Worlds.Add(World("world", "OUT"));
        var package = await fixture.LoadAsync();

        var floors = package.InteriorFloors("ROOM_2");

        Assert.Equal(["ROOM_2", "ROOM_10"], floors.Select(area => area.Id));
    }

    [Fact]
    public async Task Queries_apply_package_rules_and_pokedex_mode()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.Add(Area(
            "AREA",
            "Area",
            encounters:
            [
                Encounter("Tentacool", "SPECIES_TENTACOOL", "Surf", "Both"),
                Encounter("Rattata", "SPECIES_RATTATA", "Grass / cave", "Both")
            ],
            items: [Item("Hidden Potion", "Hidden"), Item("Potion", "Visible")],
            special:
            [
                Special("Trade", "SPECIES_MR_MIME", "Trade", "Both"),
                Special("Gift", "SPECIES_EEVEE", "Gift", "Both")
            ]));
        fixture.Pokedex.AddRange([
            new PokedexEntry { Number = 25, RegionalNumber = 12, Name = "Pikachu", SpeciesId = "SPECIES_PIKACHU", Availability = new() { ["Red"] = "Obtainable", ["Blue"] = "Trade / transfer required" } },
            new PokedexEntry { Number = 151, Name = "Mew", SpeciesId = "SPECIES_MEW", Availability = new() { ["Red"] = "Event distribution", ["Blue"] = "Event distribution" } }
        ]);
        fixture.Worlds.Add(World("world", "AREA"));
        var package = await fixture.LoadAsync();
        var area = package.Area("AREA")!;

        Assert.Equal(["Random encounters", "Surfing"], package.EncounterGroups(area, "Red").Select(group => group.Name));
        Assert.Equal(["Visible", "Hidden"], package.ItemGroups(area).Select(group => group.Kind));
        Assert.Equal(["Gift", "Trade"], package.SpecialPokemonGroups(area, "Red").Select(group => group.Kind));

        var regional = Assert.Single(package.SearchPokedex("Kanto", "Red", "12"));
        Assert.Equal("Pikachu", regional.Entry.Name);
        Assert.Equal(12, regional.Number);
        Assert.Equal("Obtainable", regional.Availability);
        Assert.Equal("games/test/sprites/pokemon/mr.mime.png", package.PokemonIcon("SPECIES_MR_MIME", "Red"));
    }

    [Fact]
    public async Task EncounterGroups_separates_conditional_tables()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.Add(Area(
            "AREA",
            "Area",
            encounters:
            [
                Encounter("Pidgey", "SPECIES_PIDGEY", "Grass / cave", "Both", "Morning"),
                Encounter("Hoothoot", "SPECIES_HOOTHOOT", "Grass / cave", "Both", "Night")
            ]));
        fixture.Worlds.Add(World("world", "AREA"));
        var package = await fixture.LoadAsync();

        Assert.Equal(
            ["Random encounters · Morning", "Random encounters · Night"],
            package.EncounterGroups(package.Area("AREA")!, "Red").Select(group => group.Name));
    }

    [Fact]
    public async Task EncounterGroups_collapses_identical_time_tables()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.Add(Area(
            "AREA",
            "Area",
            encounters:
            [
                Encounter("Pidgey", "SPECIES_PIDGEY", "Grass / cave", "Both", "Morning"),
                Encounter("Pidgey", "SPECIES_PIDGEY", "Grass / cave", "Both", "Day"),
                Encounter("Pidgey", "SPECIES_PIDGEY", "Grass / cave", "Both", "Night")
            ]));
        fixture.Worlds.Add(World("world", "AREA"));
        var package = await fixture.LoadAsync();

        var group = Assert.Single(package.EncounterGroups(package.Area("AREA")!, "Red"));
        Assert.Equal("Random encounters", group.Name);
        Assert.Equal(100, Assert.Single(group.Encounters).Chance);
    }

    [Fact]
    public async Task EncounterGroups_collapses_only_the_equal_time_subset()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.Add(Area(
            "AREA",
            "Area",
            encounters:
            [
                Encounter("Pidgey", "SPECIES_PIDGEY", "Grass / cave", "Both", "Morning"),
                Encounter("Pidgey", "SPECIES_PIDGEY", "Grass / cave", "Both", "Day"),
                Encounter("Hoothoot", "SPECIES_HOOTHOOT", "Grass / cave", "Both", "Night")
            ]));
        fixture.Worlds.Add(World("world", "AREA"));
        var package = await fixture.LoadAsync();

        var groups = package.EncounterGroups(package.Area("AREA")!, "Red");
        Assert.Equal(["Random encounters · Morning / Day", "Random encounters · Night"], groups.Select(group => group.Name));
        Assert.All(groups, group => Assert.Single(group.Encounters));
    }

    [Fact]
    public async Task EncounterGroups_collapses_prefixed_and_precombined_time_tables()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.Add(Area(
            "AREA",
            "Area",
            encounters:
            [
                Encounter("Pidgey", "SPECIES_PIDGEY", "Grass / cave", "Both", "Swarm · Morning / Day"),
                Encounter("Pidgey", "SPECIES_PIDGEY", "Grass / cave", "Both", "Swarm · Night")
            ]));
        fixture.Worlds.Add(World("world", "AREA"));
        var package = await fixture.LoadAsync();

        var group = Assert.Single(package.EncounterGroups(package.Area("AREA")!, "Red"));
        Assert.Equal("Random encounters · Swarm", group.Name);
        Assert.Single(group.Encounters);
    }

    [Fact]
    public async Task EncounterGroups_collapses_tables_after_version_selection()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.Add(Area(
            "AREA",
            "Area",
            encounters:
            [
                Encounter("Pidgey", "SPECIES_PIDGEY", "Grass / cave", "Red", "Morning"),
                Encounter("Pidgey", "SPECIES_PIDGEY", "Grass / cave", "Red", "Day"),
                Encounter("Pidgey", "SPECIES_PIDGEY", "Grass / cave", "Red", "Night"),
                Encounter("Hoothoot", "SPECIES_HOOTHOOT", "Grass / cave", "Blue", "Morning"),
                Encounter("Hoothoot", "SPECIES_HOOTHOOT", "Grass / cave", "Blue", "Day"),
                Encounter("Zubat", "SPECIES_ZUBAT", "Grass / cave", "Blue", "Night")
            ]));
        fixture.Worlds.Add(World("world", "AREA"));
        var package = await fixture.LoadAsync();

        Assert.Equal(
            ["Random encounters"],
            package.EncounterGroups(package.Area("AREA")!, "Red").Select(group => group.Name));
        Assert.Equal(
            ["Random encounters · Morning / Day", "Random encounters · Night"],
            package.EncounterGroups(package.Area("AREA")!, "Blue").Select(group => group.Name));
    }

    [Fact]
    public async Task PokemonIcon_prefers_the_selected_versions_sprite()
    {
        var fixture = PackageFixture.Create();
        fixture.Manifest.PokemonSprites["SPECIES_PIKACHU"] = "pikachu.png";
        fixture.Manifest.PokemonSpritesByVersion["Red"] = new() { ["SPECIES_PIKACHU"] = "pikachu-red.png" };
        fixture.Manifest.PokemonSpritesByVersion["Blue"] = new() { ["SPECIES_PIKACHU"] = "pikachu-blue.png" };
        fixture.FieldGuide.Areas.Add(Area("AREA", "Area"));
        fixture.Worlds.Add(World("world", "AREA"));
        var package = await fixture.LoadAsync();

        Assert.Equal("games/test/sprites/pokemon/pikachu-red.png", package.PokemonIcon("SPECIES_PIKACHU", "Red"));
        Assert.Equal("games/test/sprites/pokemon/pikachu-blue.png", package.PokemonIcon("SPECIES_PIKACHU", "Blue"));
        Assert.Equal("games/test/sprites/pokemon/pikachu.png", package.PokemonIcon("SPECIES_PIKACHU", "Unknown"));
    }

    [Fact]
    public void Every_encounter_type_has_complete_presentation()
    {
        var presentations = Enum.GetValues<EncounterType>()
            .Select(type => type.Presentation())
            .ToList();

        Assert.All(presentations, presentation => Assert.False(string.IsNullOrWhiteSpace(presentation.DisplayName)));
        Assert.Equal(presentations.Count, presentations.Select(presentation => presentation.Order).Distinct().Count());
    }

    [Fact]
    public async Task Assembly_uses_manifest_area_aliases()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.Add(Area("AREA", "Area"));
        fixture.Worlds.Add(World("world", "PLACEMENT"));
        fixture.Manifest.AreaAliases["PLACEMENT"] = "AREA";
        fixture.Definition.DefaultAreaId = "PLACEMENT";

        var package = await fixture.LoadAsync();

        Assert.Equal("AREA", package.Area("PLACEMENT")!.Id);
        Assert.True(package.IsOutdoor("AREA"));
    }

    [Fact]
    public async Task AreaChecklist_counts_each_available_species_once()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.Add(Area(
            "AREA",
            "Area",
            encounters: [Encounter("Pikachu", "SPECIES_PIKACHU", "Grass / cave", "Red")],
            items: [Item("Potion", "Visible")],
            special:
            [
                Special("Pikachu Gift", "SPECIES_PIKACHU", "Gift", "Red"),
                Special("Eevee Gift", "SPECIES_EEVEE", "Gift", "Red"),
                Special("Blue Gift", "SPECIES_SQUIRTLE", "Gift", "Blue")
            ]));
        fixture.Worlds.Add(World("world", "AREA"));
        var package = await fixture.LoadAsync();

        var checklist = package.AreaChecklist(package.Area("AREA")!, "Red");

        Assert.Equal(["SPECIES_EEVEE", "SPECIES_PIKACHU"], checklist.SpeciesIds.Order());
        Assert.Equal(["item:Potion"], checklist.ItemIds);
    }

    [Fact]
    public async Task Renewable_map_resources_are_searchable_but_not_checklist_items()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.Add(Area(
            "AREA",
            "Area",
            items: [Item("Potion", "Visible")],
            resources:
            [
                new GuideMapResource
                {
                    Name = "Contest prize",
                    Kind = "Weekly harvest",
                    Comment = "Speak to the judge after the contest.",
                    X = 4,
                    Y = 6,
                    Rewards =
                    [
                        new GuideResourceReward { Name = "Sun Stone", Quantity = 1, Comment = "First place." },
                        new GuideResourceReward { Name = "Everstone", Quantity = 1, Comment = "Second place." }
                    ]
                }
            ]));
        fixture.Worlds.Add(World("world", "AREA"));
        var package = await fixture.LoadAsync();

        var area = Assert.Single(package.SearchAreas("Weekly", "Red"));
        Assert.Same(area, Assert.Single(package.SearchAreas("judge", "Red")));
        Assert.Same(area, Assert.Single(package.SearchAreas("Sun Stone", "Red")));
        Assert.Same(area, Assert.Single(package.SearchAreas("Second place", "Red")));
        var checklist = package.AreaChecklist(area, "Red");

        Assert.Equal(["item:Potion"], checklist.ItemIds);
    }

    [Fact]
    public async Task SearchAreas_returns_every_matching_area()
    {
        var fixture = PackageFixture.Create();
        fixture.FieldGuide.Areas.AddRange(Enumerable.Range(1, 81).Select(number => Area($"AREA_{number}", $"Match {number}")));
        fixture.Worlds.Add(World("world", "AREA_1"));
        var package = await fixture.LoadAsync();

        var results = package.SearchAreas("Match", "Red");

        Assert.Equal(81, results.Count);
    }

    private static GuideArea Area(
        string id,
        string name,
        List<Encounter>? encounters = null,
        List<GuideItem>? items = null,
        List<SpecialPokemon>? special = null,
        List<MapEntrance>? entrances = null,
        List<GuideMapResource>? resources = null) => new()
        {
            Id = id,
            Name = name,
            Region = "Kanto",
            MapImage = $"games/test/maps/{id}.png",
            MapWidth = 16,
            MapHeight = 16,
            Encounters = encounters ?? [],
            Items = items ?? [],
            Resources = resources ?? [],
            SpecialPokemon = special ?? [],
            Entrances = entrances ?? []
        };

    private static Encounter Encounter(string species, string speciesId, string method, string version, string? condition = null) => new()
    {
        Species = species,
        SpeciesId = speciesId,
        Method = method,
        Condition = condition,
        Version = version,
        MinLevel = 5,
        MaxLevel = 5,
        Chance = 100,
        Type = method switch
        {
            "Grass / cave" => EncounterType.Random,
            "Surf" => EncounterType.Surfing,
            _ => throw new InvalidOperationException($"Test encounter method '{method}' is not classified.")
        }
    };

    private static GuideItem Item(string name, string kind) => new()
    {
        Id = $"item:{name}",
        Name = name,
        Kind = kind,
        Icon = "question_mark.png"
    };

    private static SpecialPokemon Special(string id, string speciesId, string kind, string version) => new()
    {
        Id = $"special:{id}",
        Species = id,
        SpeciesId = speciesId,
        Kind = kind,
        Version = version
    };

    private static MapEntrance Entrance(string id, string targetId, int x, int y) => new()
    {
        Id = id,
        TargetId = targetId,
        Name = targetId,
        X = x,
        Y = y
    };

    private static GuideWorld World(string id, params string[] areaIds) => new()
    {
        Id = id,
        Image = $"games/test/maps/{id}.png",
        Width = 100,
        Height = 100,
        Maps = [.. areaIds.Select(areaId => new WorldMapPlacement { Id = areaId, Width = 16, Height = 16 })]
    };

    private sealed class PackageFixture
    {
        public GameDefinition Definition { get; } = new()
        {
            Id = "test",
            Name = "Test",
            DataPath = "games/test/data/fieldguide.json",
            PokedexPath = "games/test/data/pokedex.json",
            WorldsPath = "games/test/data/worlds.json",
            PokemonSpritePath = "games/test/sprites/pokemon",
            ItemSpritePath = "games/test/sprites/items",
            DefaultAreaId = "OUT",
            DefaultWorldId = "world",
            Versions =
            [
                new() { Id = "Red", Name = "Red" },
                new() { Id = "Blue", Name = "Blue" }
            ],
            Regions = [new() { Id = "Kanto", Name = "Kanto", WorldId = "world" }],
            DexModes =
            [
                new() { Id = "Kanto", Name = "Kanto", Regional = true },
                new() { Id = "National", Name = "National", Regional = false }
            ]
        };

        public FieldGuideData FieldGuide { get; } = new();
        public List<PokedexEntry> Pokedex { get; } = [];
        public List<GuideWorld> Worlds { get; } = [];
        public PackageManifest Manifest { get; } = new()
        {
            FormatVersion = 2,
            PokemonSprites = new() { ["SPECIES_MR_MIME"] = "mr.mime.png" }
        };

        public static PackageFixture Create() => new();

        public async Task<GamePackage> LoadAsync()
        {
            var responses = new Dictionary<string, object>
            {
                [Definition.DataPath] = FieldGuide,
                [Definition.PokedexPath] = Pokedex,
                [Definition.WorldsPath] = Worlds,
                ["games/test/data/package-manifest.json"] = Manifest
            };
            var http = new HttpClient(new JsonHandler(responses)) { BaseAddress = new Uri("https://field-guide.test/") };
            return await new GamePackageLoader(http).LoadAsync(Definition);
        }
    }

    private sealed class JsonHandler(IReadOnlyDictionary<string, object> responses) : HttpMessageHandler
    {
        private static readonly JsonSerializerOptions JsonOptions = PokemonFieldGuideJson.Options;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.PathAndQuery.TrimStart('/');
            var json = JsonSerializer.Serialize(responses[path], responses[path].GetType(), JsonOptions);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            });
        }
    }
}
