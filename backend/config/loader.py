import yaml
from pathlib import Path
from config.schema import CountryConfig

_configs: dict[str, CountryConfig] = {}


def load_all_configs() -> None:
    countries_dir = Path(__file__).parent / "countries"
    for yaml_file in countries_dir.glob("*.yaml"):
        with open(yaml_file) as f:
            data = yaml.safe_load(f)
        config = CountryConfig(**data)
        _configs[config.country_code] = config
    print(f"Loaded {len(_configs)} country configs: {list(_configs.keys())}")


def get_config(country_code: str) -> CountryConfig:
    code = country_code.upper()
    if code in _configs:
        return _configs[code]
    # Fall back to default config, patching in the requested country's code
    if "WORLD" in _configs:
        base = _configs["WORLD"].model_copy(update={
            "country_code": code,
            "country_name": code,  # caller can override display name in UI
        })
        return base
    available = list(_configs.keys())
    raise ValueError(f"Country '{code}' not found and no default config loaded. Available: {available}")


def list_countries() -> list[dict]:
    return [
        {
            "country_code": c.country_code,
            "country_name": c.country_name,
            "flag_emoji": c.flag_emoji,
            "region": c.region,
            "language": c.language,
        }
        for c in _configs.values()
    ]
