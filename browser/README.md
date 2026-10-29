# FFB browser prototype

First milestone: a browser speaks the existing FFB WebSocket protocol. The unmodified BB2025 match rules run in Java. This client supports two demo coaches in one browser, pregame readiness, declining inducements, coin/kick/receive choices, and setup placement. Adjacent regular movement has an initial implementation but is not yet integration-tested. Many dialogs and game actions remain unsupported; this is not a complete playable match client.

## Start on Windows

From the repository root:

```powershell
./browser/start.ps1
```

Open http://127.0.0.1:22227/index.html. Java 21 and Maven are required for the first build. The script also recognizes the project-local Maven at `.tools/apache-maven-3.9.9`. All downloaded Maven artifacts stay in `.tools/m2`. To rebuild after Java changes, stop the server with Ctrl+C and run `./browser/start.ps1 -Build`.

The optional Maven profile `browser-dev` adds H2, so development needs no separately installed database. The script creates a dedicated database under `browser/.runtime` on first launch. Never run the upstream `initDb` command against an existing database: it drops and recreates tables. The launcher only initializes when its dedicated database file does not exist.

The browser configuration binds to **127.0.0.1**. It disables wire compression so browser JavaScript can read the existing JSON commands directly. Production configuration and rules are unchanged. This uses upstream demo coaches and published demo authentication strings, not FUMBBL accounts. It makes no FUMBBL login requests. H2 is only a development convenience; production persistence has not been validated with it.

## Try the verified flow

1. Choose a local match name and click **Connect both coaches**.
2. Click **Ready / start** in each coach view.
3. Switch views as needed and choose **Buy no inducements** for each team's prompt.
4. Choose heads or tails. Switch to the coach named by the receive-choice prompt and choose receive or kick.
5. During setup, choose the active coach view. Select a player in the roster and click a square on the left half of the pitch. Each coach sees their own team on the left; the server mirrors coordinates for the opponent.

Use a new match name for another experiment. Reloading disconnects both coaches; unfinished standalone test matches can be removed by the upstream server when disconnected. This milestone does not provide persistent leagues or reliable match recovery.

The protocol inspector shows raw prompts and allows sending existing FFB JSON commands. Unsupported dialogs need further client work. No match rules are reimplemented in JavaScript, and the pitch updates only after the server sends model changes.

## Verify

With the server running:

```powershell
node browser/smoke.mjs
```

This integration check uses the same `Connection` and state reducer as the browser. It verifies two authenticated coach joins, BB2025 snapshots, pregame completion, a setup placement confirmed by the server, and its mirrored update for the other coach. It uses a unique temporary match name and disconnects when finished.

The upstream common/server suite can be run with:

```powershell
mvn -pl ffb-server -am -Pmockito5 test
```

The browser does not yet apply every model-change type. It currently handles game, field, acting-player and turn scalar changes plus player coordinate/state updates. Full result reporting, skill dialogs, animations, all match actions, recovery and league progression remain future work.

Source baseline: upstream commit `bf3f89d96b5143a8730910a841e7430791094492`. FFB remains under its existing MIT license.
