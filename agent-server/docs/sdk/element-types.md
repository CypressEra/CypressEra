# Element Types Reference

This document provides detailed information about each element type, including identifier requirements and valid data fields.

## Bus

**Identifier:**
- `ibus` (number, required): Bus number

**Valid Data Fields for Modify:**
- `name` (string): Bus name
- `baskv` (number): Base voltage in kV
- `ide` (number): Bus type code
- `vm` (number): Voltage magnitude (pu)
- `va` (number): Voltage angle (degrees)
- `area` (number): Area number
- `zone` (number): Zone number
- `owner` (number): Owner number
- `nvhi`, `nvlo` (number): Normal voltage high/low (pu)
- `evhi`, `evlo` (number): Emergency voltage high/low (pu)

**Example Modify:**
```json
{
  "elementType": "bus",
  "identifier": {"ibus": 1},
  "data": {"baskv": 150, "name": "BUS 1", "area": 2, "vm": 1.05}
}
```

## Load

**Identifier:**
- `ibus` (number, required): Bus number
- `loadid` (string, required): Load ID

**Valid Data Fields for Modify:**
- `ibus` (number): Bus number
- `loadid` (string): Load ID
- `stat` (number): Status (0 = out of service, 1 = in service)
- `pl` (number): Active power load (MW)
- `ql` (number): Reactive power load (MVAR)

**Example Modify:**
```json
{
  "elementType": "load",
  "identifier": {"ibus": 1, "loadid": "1"},
  "data": {"pl": 100.0, "ql": 50.0}
}
```

## Generator

**Identifier:**
- `ibus` (number, required): Bus number
- `machid` (string, required): Machine ID

**Valid Data Fields for Modify:**
- `ibus` (number): Bus number
- `machid` (string): Machine ID
- `pg` (number): Active power generation (MW)
- `qg` (number): Reactive power generation (MVAR)
- `qt` (number): Maximum reactive power (MVAR)
- `qb` (number): Minimum reactive power (MVAR)
- `vs` (number): Voltage setpoint (pu)
- `ireg` (number): Remote bus number for voltage control
- `mbase` (number): Machine base MVA
- `stat` (number): Status (0 = out of service, 1 = in service)

**Example Modify:**
```json
{
  "elementType": "generator",
  "identifier": {"ibus": 1, "machid": "1"},
  "data": {"pg": 200.0, "qg": 100.0, "vs": 1.0}
}
```

## AC Line (acline)

**Identifier:**
- `ibus` (number, required): From bus number
- `jbus` (number, required): To bus number
- `ckt` (string, required): Circuit ID

**Valid Data Fields for Modify:**
- `ibus` (number): From bus number
- `jbus` (number): To bus number
- `ckt` (string): Circuit ID
- `r` (number): Resistance (pu)
- `x` (number): Reactance (pu)
- `b` (number): Susceptance (pu)
- `ratea` (number): Rating A (MVA)
- `rateb` (number): Rating B (MVA)
- `ratec` (number): Rating C (MVA)
- `stat` (number): Status (0 = out of service, 1 = in service)

**Example Modify:**
```json
{
  "elementType": "acline",
  "identifier": {"ibus": 1, "jbus": 2, "ckt": "1"},
  "data": {"r": 0.01, "x": 0.05, "b": 0.001}
}
```

## Transformer

**Identifier:**
- `ibus` (number, required): From bus number
- `jbus` (number, required): To bus number
- `kbus` (number, optional): Third winding bus (0 for two-winding, bus number for three-winding)
- `ckt` (string, required): Circuit ID

**Note:** For two-winding transformers, `kbus` should be 0 or omitted.

**Valid Data Fields for Modify:**
- `ibus` (number): From bus number
- `jbus` (number): To bus number
- `kbus` (number): Third winding bus
- `ckt` (string): Circuit ID
- `stat` (number): Status (0 = out of service, 1 = in service)
- `r12` (number): Resistance between windings 1 and 2 (pu)
- `x12` (number): Reactance between windings 1 and 2 (pu)

**Example Modify:**
```json
{
  "elementType": "transformer",
  "identifier": {"ibus": 1, "jbus": 2, "kbus": 0, "ckt": "1"},
  "data": {"r12": 0.01, "x12": 0.1}
}
```

## Common Notes

1. **Identifier Format:** Always use an object with the required keys. Never use just a number.
2. **Data Fields:** Only include the fields you want to modify. You don't need to include all fields.
3. **Field Names:** Use the exact field names as shown above. Field names are case-sensitive.
4. **Required vs Optional:** Identifier fields marked as "required" must always be present. Data fields can be selectively included.

