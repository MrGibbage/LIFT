# LIFT — Logging Individual Fitness Targets

A mobile-first, fully offline PWA for tracking weight settings on gym machines.

## Features

- Track weight settings across multiple weight machines
- Photo of each machine for quick identification
- Circuit mode — chain machines into a named workout and step through them in order
- All data stored locally on-device (IndexedDB) — no account, no backend, no internet required
- Installable on Android Chrome via PWA

## Tech Stack

Plain HTML5, CSS3, and vanilla JavaScript (ES6+). No frameworks, no build step.

- **Storage:** IndexedDB
- **Offline:** Service Worker (cache-first)
- **Install:** Web App Manifest

## Usage

Open the app, add your machines (name + optional photo), set the current weight. Tap a machine card to log a workout. Create circuits to step through multiple machines in sequence.

## Deployment

Served as static files over HTTPS. No server-side logic required.

## Data Portability

Export all data (machines, workout history, circuits) to a single JSON file. Import restores everything, including machine photos.
