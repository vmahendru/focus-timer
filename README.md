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

## Run it locally

Nothing about the hosted copy is required. Clone the repository and serve the
folder from your own machine with the included server, which uses only Node's
standard library and listens on localhost only:

```sh
git clone https://github.com/vmahendru/focus-timer.git
cd focus-timer
node serve.js            # http://127.0.0.1:8080/
```

Any static server works the same way, for example `python3 -m http.server`.
You can also open `index.html` straight from the folder with no server at all.
Everything works that way except the offline cache, which browsers only enable
over http. Prefer the server on a shared machine: Chromium-based browsers give
every locally opened file the same storage origin, so another local HTML file
could read the saved task.

## Your data

The task, the timer state and your settings are stored in the browser's local
storage for the site origin, on the device you are using. There is no server,
no account, no sync and no analytics, and the page sets a Content Security
Policy that forbids the browser from connecting to any host at all. Nothing
you type is sent anywhere.

Two people using the same operating system account and browser profile on one
machine share that storage and would see the same task. Separate accounts or
browser profiles are isolated from each other. To wipe everything, clear the
site's data in the browser.

## Use

Type your one task at the top. Press Start. That is the whole app.

| Key | Action |
| --- | --- |
| Space | Start or pause |
| R | Reset the current session |
| 1, 2, 3 | Focus, short break, long break |
| T | Edit the task |

Session lengths, the chime, notifications and the colour scheme are under the
gear icon. Six schemes ship: Amber, Old Glory, Monochrome, Evergreen, Chalk
and Dusk. Each one paints focus and break sessions differently. To add your
own, copy one of the `[data-theme]` blocks in `style.css`, give it a name, and
add a matching button in the Colours section of `index.html`.
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
