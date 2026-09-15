# Focus

One task, one timer. Live at <https://vmahendru.github.io/focus-timer/>.

A pomodoro timer that shows the single thing you are working on and how much
time is left, readable from across a room. The band of colour drains as the
session runs.

- Runs on iPhone and Mac as an installable web app. No App Store.
- No accounts, no sync, no analytics, no fonts or scripts fetched from anywhere.
  After the first load it works fully offline.
- Plain HTML, CSS and JavaScript. No build step, no dependencies.
- The task and timer state live in your browser's local storage on each device.

## Install

**iPhone or iPad:** open the site in Safari, tap Share, then *Add to Home
Screen*. Notifications when a session ends only work from the installed app.

**Mac:** open the site in Safari and choose *File › Add to Dock*. In Chrome or
Edge, use the install icon in the address bar.

**Any machine, no hosting:** clone this repository and open `index.html` in a
browser. Everything works except the offline cache, which browsers only allow
over http.

```sh
git clone https://github.com/vmahendru/focus-timer.git
open focus-timer/index.html
```

## Use

Type your one task at the top. Press Start. That is the whole app.

| Key | Action |
| --- | --- |
| Space | Start or pause |
| R | Reset the current session |
| 1, 2, 3 | Focus, short break, long break |
| T | Edit the task |

Session lengths, the chime and notifications are under the gear icon.
Defaults are 25 minutes of focus, 5 minutes of short break and a 15 minute
long break after every 4 sessions. Dots under the clock count focus sessions
finished today.

The timer keeps time from the wall clock, so it stays accurate when the phone
is locked or the tab is in the background. It never starts the next session
on its own.

## Develop

```sh
node --test test/          # timer logic
python3 -m http.server     # then open http://localhost:8000
```

`timer.js` is pure logic with no DOM access and is the only file with tests.
`app.js` wires it to the page. `sw.js` is the offline cache; bump `VERSION`
there when you change any file so installed copies pick up the update.

## License

MIT
