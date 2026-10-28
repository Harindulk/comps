// What changes per launch format: which Qloo entity types the comps come from, and the labels.
export type Format = 'game' | 'music' | 'comedy' | 'film'

export const FORMATS: Record<Format, {
  label: string; types: string; title: string; titlePh: string; pitchPh: string; compsLabel: string; searchPh: string
  who: string; panel: string; panelLede: string; copy: string
}> = {
  game: {
    label: 'Game', types: 'urn:entity:videogame', title: 'Your game', titlePh: 'Drive Away',
    pitchPh: 'A one-thumb endless driving game: dodge traffic on a highway that never ends, earn new cars, chase your best distance.',
    compsLabel: 'Comparable games', searchPh: 'Search Qloo for a game, e.g. Hades',
    who: 'Who plays the comps', panel: 'Player panel', panelLede: 'Four players built from the cited audience data, reacting to the pitch.', copy: 'Store page draft',
  },
  music: {
    label: 'Album or tour', types: 'urn:entity:artist', title: 'Your album, single or tour', titlePh: 'Night Bus Home',
    pitchPh: 'A debut EP of warm, late-night instrumental funk, with a small club tour after release.',
    compsLabel: 'Comparable artists', searchPh: 'Search Qloo for an artist, e.g. Khruangbin',
    who: 'Who listens to the comps', panel: 'Listener panel', panelLede: 'Four listeners built from the cited audience data, reacting to the pitch.', copy: 'Press kit blurb',
  },
  comedy: {
    label: 'Comedy', types: 'urn:entity:person,urn:entity:tv_show,urn:entity:artist', title: 'Your special or tour', titlePh: 'Small Talk Tour',
    pitchPh: 'A first headline stand-up tour about growing up between two countries, 20 club dates.',
    compsLabel: 'Comparable comedians or shows', searchPh: 'Search Qloo for a comedian, e.g. Nate Bargatze',
    who: 'Who watches the comps', panel: 'Fan panel', panelLede: 'Four fans built from the cited audience data, reacting to the pitch.', copy: 'Show description',
  },
  film: {
    label: 'Film or series', types: 'urn:entity:movie,urn:entity:tv_show,urn:entity:book', title: 'Your film or series', titlePh: 'Neon Debt',
    pitchPh: 'A low-budget darkly comic thriller about two strangers whose road-rage feud spirals into a family war.',
    compsLabel: 'Comparable films, shows or books', searchPh: 'Search Qloo for a film or show, e.g. Uncut Gems',
    who: 'Who watches the comps', panel: 'Viewer panel', panelLede: 'Four viewers built from the cited audience data, reacting to the pitch.', copy: 'Logline and synopsis',
  },
}

export const formatOf = (f?: string): Format => (f && f in FORMATS ? (f as Format) : 'game')
