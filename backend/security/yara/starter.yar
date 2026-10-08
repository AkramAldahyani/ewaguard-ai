// EWAGuard-owned static indicators. No payloads, imports, or external rule packs.
rule EWAGuard_Encoded_PowerShell_Chain {
  meta:
    description = "PowerShell encoding plus execution-obscuring options"
    confidence = "warning"
    owner = "EWAGuard AI"
  strings:
    $engine = "powershell" nocase ascii wide
    $encoded = "-encodedcommand" nocase ascii wide
    $conceal1 = "-windowstyle hidden" nocase ascii wide
    $conceal2 = "-executionpolicy bypass" nocase ascii wide
  condition:
    filesize < 10485761 and $engine and $encoded and 1 of ($conceal*)
}
rule EWAGuard_Credential_Collection_Chain {
  meta:
    description = "Browser credential-store access together with decryption and transfer APIs"
    confidence = "strong"
    owner = "EWAGuard AI"
  strings:
    $store1 = "Login Data" ascii wide
    $store2 = "logins.json" ascii wide
    $decrypt = "CryptUnprotectData" ascii wide
    $transfer1 = "UploadString" ascii wide
    $transfer2 = "HttpSendRequest" ascii wide
  condition:
    filesize < 10485761 and 1 of ($store*) and $decrypt and 1 of ($transfer*)
}
rule EWAGuard_Macro_Launch_Chain {
  meta:
    description = "Automatic macro entry point combined with scripting-shell launch markers"
    confidence = "warning"
    owner = "EWAGuard AI"
  strings:
    $entry1 = "AutoOpen" nocase ascii wide
    $entry2 = "Document_Open" nocase ascii wide
    $shell = "WScript.Shell" nocase ascii wide
    $launch1 = "powershell" nocase ascii wide
    $launch2 = "cmd.exe" nocase ascii wide
  condition:
    filesize < 10485761 and 1 of ($entry*) and $shell and 1 of ($launch*)
}
rule EWAGuard_Archive_Launch_Chain {
  meta:
    description = "Archive expansion combined with process launch and temporary-directory markers"
    confidence = "warning"
    owner = "EWAGuard AI"
  strings:
    $unpack = "Expand-Archive" nocase ascii wide
    $launch = "Start-Process" nocase ascii wide
    $temp1 = "$env:TEMP" nocase ascii wide
    $temp2 = "GetTempPath" nocase ascii wide
  condition:
    filesize < 10485761 and $unpack and $launch and 1 of ($temp*)
}
rule EWAGuard_Harmless_Demo {
  meta:
    description = "Explicit harmless EWAGuard test marker; not a malware signature"
    confidence = "demo"
    owner = "EWAGuard AI"
  strings:
    $marker = "EWAGUARD_YARA_DEMO_6C" ascii
    $purpose = "HARMLESS_STATIC_TEST" ascii
  condition:
    filesize < 10485761 and all of them
}
