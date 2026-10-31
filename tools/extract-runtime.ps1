param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$target=[IO.Path]::GetFullPath($Destination)
if(Test-Path -LiteralPath $target){throw 'Destination must not exist'}
$prefix=$target.TrimEnd('\')+'\'
$zip=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Archive))
try {
    if($zip.Entries.Count -gt 15000){throw 'Too many archive entries'}
    [long]$bytes=0
    $names=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach($entry in $zip.Entries){
        $name=$entry.FullName
        if($name.Contains('\') -or $name.Contains(':') -or $name.StartsWith('/') -or ($name.Split('/') -contains '..')){throw 'Unsafe archive path'}
        if(($entry.ExternalAttributes -band 0xF0000000) -eq 0xA0000000){throw 'Archive links are not allowed'}
        $file=[IO.Path]::GetFullPath([IO.Path]::Combine($target,$name))
        if(-not $file.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Archive entry outside destination'}
        if(-not $names.Add($file)){throw 'Duplicate archive entry'}
        $bytes+=$entry.Length
        if($bytes -gt 1500000000){throw 'Archive too large'}
    }
    [IO.Directory]::CreateDirectory($target)|Out-Null
    foreach($entry in $zip.Entries){
        $file=[IO.Path]::GetFullPath([IO.Path]::Combine($target,$entry.FullName))
        if($entry.FullName.EndsWith('/')){[IO.Directory]::CreateDirectory($file)|Out-Null;continue}
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file))|Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$file,$false)
    }
} finally {$zip.Dispose()}
