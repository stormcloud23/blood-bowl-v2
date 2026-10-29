param([switch]$Build)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$localMaven = Join-Path $repoRoot '.tools/apache-maven-3.9.9/bin/mvn.cmd'
$mavenCommand = if (Test-Path $localMaven) { $localMaven } else { 'mvn' }
$localRepository = Join-Path $repoRoot '.tools/m2'
Push-Location $repoRoot
try {
    if ($Build -or !(Test-Path 'browser/.runtime/server/FantasyFootballServer.jar')) {
        & $mavenCommand "-Dmaven.repo.local=$localRepository" -pl ffb-server -am '-Pmockito5,browser-dev' install '-DskipTests'
        if ($LASTEXITCODE -ne 0) { throw 'Maven build failed.' }
        Expand-Archive -LiteralPath ffb-server/target/ffb-server.zip -DestinationPath browser/.runtime/server -Force
    }
    New-Item -ItemType Directory -Force browser/.runtime | Out-Null
    $classpath = (Join-Path $repoRoot 'browser/.runtime/server/FantasyFootballServer.jar') + ';' + (Join-Path $repoRoot 'browser/.runtime/server/lib/*')
    Push-Location ffb-server
    try {
        if (!(Test-Path '../browser/.runtime/ffb.mv.db')) {
            & java -cp $classpath com.fumbbl.ffb.server.FantasyFootballServer standalone initDb -inifile ../browser/server.ini
            if ($LASTEXITCODE -ne 0) { throw 'Local database initialization failed.' }
        }
        Write-Host 'Open http://127.0.0.1:22227/index.html (Ctrl+C stops the server)'
        & java -cp $classpath com.fumbbl.ffb.server.FantasyFootballServer standalone -inifile ../browser/server.ini
        if ($LASTEXITCODE -ne 0) { throw "Server exited with code $LASTEXITCODE" }
    } finally { Pop-Location }
} finally { Pop-Location }
