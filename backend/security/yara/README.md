# EWAGuard-owned starter rules

`starter.yar` is reviewed project source, not a downloaded community ruleset.
It contains no executable payloads and imports no YARA modules. Conditions combine
multiple markers and apply only to files no larger than the 10 MiB upload limit.

| Rule | Purpose | Interpretation |
| --- | --- | --- |
| EWAGuard_Encoded_PowerShell_Chain | Encoded command plus concealment/execution-policy options | Warning; legitimate administration may match |
| EWAGuard_Credential_Collection_Chain | Credential-store, decryption, and transfer API markers together | Strong static evidence; still requires review |
| EWAGuard_Macro_Launch_Chain | Automatic macro entry point and shell/launcher markers | Warning; raw-byte visibility is limited |
| EWAGuard_Archive_Launch_Chain | Archive expansion, process launch and temporary-directory markers | Warning; installers may match |
| EWAGuard_Harmless_Demo | Both explicit EWAGuard test markers | Demo only, not a malware signature |

The analyzer runs YARA without printing matched strings or arbitrary metadata.
Descriptions/strengths come from an application-owned catalog in
`backend/src/analyzers/file/file-scanners.js`. Unknown configured rule names receive
a generic warning description, never strong confidence by default.

## Ownership and changes

Project IT/security maintainers own review and publication of these rules. Change
rules and the catalog together; keep names stable. Review false positives against
benign documents/scripts as well as harmless positive marker fixtures, validate
syntax with the supported local YARA binary, and rerun the file regression suites.
Do not add broad single-keyword rules, remote includes, raw content output, or
unreviewed community packs. Keep the configured directory read-only to the service
account in deployment. Environment configuration is trusted administrator input.

`YARA_RULES_PATH` accepts an absolute `.yar`/`.yara` file or a directory containing
up to 16 immediate rules files (128 KiB each, 512 KiB total). Symlinks are rejected.
The development default is this directory; production requires explicit configuration.
YARA compiles the source at invocation. Invalid rules return ERROR without crashing
the application. `node backend/scripts/validate-file-local.js` validates the real
starter rules against harmless benign/demo inputs and verifies invalid-rule handling.

Rules scan raw uploaded bytes. They do not unpack compressed Office/archive content
or deobfuscate scripts. NO_MATCH is not proof of safety.

[Official YARA rule syntax](https://yara.readthedocs.io/en/stable/writingrules.html)

