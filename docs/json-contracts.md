# JSON contracts

`PokemonFieldGuide.Shared.Contracts` is the authority for every JSON format that Pokemon Field Guide owns and reads at runtime. The schema generator uses the same C# types and `PokemonFieldGuideJson.Options` as the application.

## Generated schemas

The `schemas/` directory contains JSON Schema Draft 2020-12 documents for:

- the Game catalog;
- field-guide data;
- Pokédex data;
- worlds;
- package manifests v2 and v3;
- Local guide state v1;
- Checklist profile v1 and v2;
- portable backup v1 and v2.

Versioned schemas are immutable. Add a new schema file when a serialized format version changes. Keep the old schema while its migration or import path remains supported. Generators validate only the current formats they emit. Tests validate current formats and every older format that the application still accepts for migration or import.

Run the following command after you change a serialized C# contract:

```sh
just generate-schemas
```

The generator writes deterministic schema files. `just check` runs the generator in `--check` mode and fails when a committed schema differs from its C# contract.

## Validation

Package generation validates the catalog and every staged Game package document against the generated schemas. Schema validation runs before cross-document, graph, and asset checks. A staged package does not replace the installed package when either validation phase fails.

`just check` validates all committed Game packages and representative Local guide state, Checklist profile, and portable backup documents. The browser does not download the schemas or run a JSON Schema validator. Strict C# deserialization, format checks, and migration logic protect runtime inputs.

`ChecklistProfileDocument` represents an embedded profile as a typed v1 or v2 contract. The Local guide state and backup schemas constrain each profile dictionary value to one of those profile shapes. The serializer privately preserves an unrecognized future profile so opening an older application version does not erase another package's data; application code never receives an untyped JSON value.

JSON Schema owns document shape, required fields, enum strings, scalar constraints, and unknown-property rejection. Package finalization owns facts that span documents or files, including unique IDs, references, chance totals, reachability, and exact asset use.

Manifest-v3 field-guide entrances may include `version`. The value is `Both` or an exact catalog version ID. Older package documents omit the property and deserialize as `Both`.

## External JSON

These schemas cover formats owned by Pokemon Field Guide. They do not cover NuGet and npm files, .NET build output, editor configuration, or JSON from upstream Pokémon source projects. Those formats have another authority.
