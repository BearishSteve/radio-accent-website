window.RADIO_ACCENT_CONFIG = {
  stationName: 'Radio Accent',
  tagline: 'Jouw Radio, Jouw Ritme',
  siteUrl: 'https://radioaccent.be/',
  streams: {
    low: 'https://clubfmserver.be/accent.mp3',
    high: 'https://clubfmserver.be/accentdab.mp3'
  },
  defaultStreamQuality: 'high',
  nowPlayingApi: 'api/now-playing.php',
  songInfoEndpoint: 'api/songinfo.html',
  playlistHistoryApi: 'api/playlist-history.php',
  nowPlayingStreamApi: 'api/now-playing-stream.php',
  nowPlayingPollInterval: 15000,
  historyKinds: [
    {
      kind: 'news',
      keywords: ['nieuws', 'regionieuws', 'regionaal nieuws', 'headline', 'breaking']
    },
    {
      kind: 'weather',
      keywords: ['weerbericht', 'weer', 'weather', 'forecast']
    },
    {
      kind: 'traffic',
      keywords: ['verkeer', 'traffic', 'mobiliteit']
    },
    {
      kind: 'promo',
      keywords: ['promo', 'promotie', 'spot', 'commercial', 'advertentie', 'wedstrijd', 'actie', 'giveaway', 'jingle', 'station id', 'station-id', 'radio accent']
    }
  ],
  keywordCovers: [
    {
      keywords: ['nieuws', 'regionieuws', 'regionaal nieuws', 'radio accent - nieuws'],
      cover: 'assets/nieuws-cover.jpg'
    },
    {
      keywords: ['weerbericht', 'weer', 'radio accent - weerbericht'],
      cover: 'assets/weer-cover.jpg'
    },
    {
      keywords: ['verkeer', 'traffic', 'mobiliteit'],
      cover: 'assets/verkeer-cover.jpg'
    },
    {
      keywords: ['jingle', 'radio accent', 'station id', 'station-id'],
      cover: 'assets/promo-cover.jpg'
    },
    {
      keywords: ['promo', 'promotie', 'spot', 'commercial', 'advertentie'],
      cover: 'assets/promo-cover.jpg'
    },
    {
      keywords: ['wedstrijd', 'actie', 'giveaway'],
      cover: 'assets/promo-cover.jpg'
    },
    {
      keywords: ['breaking', 'update', 'headline'],
      cover: 'assets/nieuws-cover.jpg'
    },
    {
      keywords: ['weather', 'forecast'],
      cover: 'assets/weer-cover.jpg'
    },
    {
      keywords: ['file', 'non-stop', 'autopilot'],
      cover: 'assets/promo-cover.jpg'
    }
  ],
  defaultNowPlaying: {
    artist: 'ALISHA',
    title: 'Baby Talk'
  },
  defaultDabSlide: 'assets/logo_dab.png',
  weather: {
    apiEndpoint: 'api/weather.php',
    location: 'Wetteren',
    icon: 'assets/weather-cloud.svg',
    temperature: '9\u00B0C'
  },
  analytics: {
    enabled: true,
    provider: 'custom',
    domain: 'radioaccent.be',
    scriptSrc: 'https://plausible.io/js/script.js',
    endpoint: 'api/analytics.php'
  },
  cms: {
    storageKey: 'radioAccentCmsV1',
    apiEnabled: true,
    apiEndpoint: 'api/content.php',
    newsFeedEndpoint: 'api/news-feed.php',
    inboxEndpoint: 'api/contact-inbox.php',
    uploadEndpoint: 'api/upload.php',
    analyticsEndpoint: 'api/analytics.php',
    mixesPageSizeHome: 3,
    mixesFeedUrl: 'assets/mixen/mixes.json'
  },
  defaults: {
    schedule: [
      { time: '06:00 - 07:00', title: 'Accent Start', description: 'Kalm ontwaken met zachte hits en headlines.', host: '', image: '' },
      { time: '07:00 - 10:00', title: 'Accent Ochtend', description: 'Nieuws, verkeer en energieke muziek voor je dagstart.', host: '', image: '' },
      { time: '10:00 - 13:00', title: 'Accent Werkdag', description: 'Feelgood tracks en updates uit de regio.', host: '', image: '' },
      { time: '13:00 - 16:00', title: 'Accent Middag', description: 'De ideale mix voor je namiddag op kantoor of thuis.', host: '', image: '' },
      { time: '16:00 - 19:00', title: 'Accent Drive', description: 'De rit naar huis met verkeer, nieuws en requests.', host: '', image: '' },
      { time: '20:00 - 22:00', title: 'Accent Avondmix', description: 'Rustige opbouw met moderne klassiekers.', host: '', image: '' }
    ],
    mixes: [
      {
        title: 'AIRPLAY REWIND',
        dj: 'DJ BEAR',
        schedule: 'Wekelijkse avondmix',
        description: 'De beste hits, van toen en nu in de mix.',
        streamUrl: 'https://www.radioaccent.be/assets/mixen/airplay-rewind/latest.mp3',
        cover: 'https://www.radioaccent.be/assets/mixen/airplay-rewind/cover.jpg',
        updatedAt: '2026-03-11T15:16:50+00:00',
        slug: 'airplay-rewind',
        replays: [
          { label: 'Update van 11 maart 2026', url: 'https://www.radioaccent.be/assets/mixen/airplay-rewind/latest.mp3', updatedAt: '2026-03-11T15:16:50+00:00', note: 'Nieuwste versie van de weekly rewind.' },
          { label: 'Replay van 4 maart 2026', url: 'https://www.radioaccent.be/assets/mixen/airplay-rewind/latest.mp3', updatedAt: '2026-03-04T15:05:00+00:00', note: 'Vorige weekeditie ter referentie in het archief.' }
        ]
      },
      {
        title: 'FREQUENCIES',
        dj: 'DJ IRISSS',
        schedule: 'Elke donderdag avond tussen 22 en 23 uur',
        description: 'De donderdag warming-up voor het weekend.',
        streamUrl: 'https://www.radioaccent.be/assets/mixen/frequencies/latest.mp3',
        cover: 'assets/mixen/dj_smooth.jpg',
        updatedAt: '2026-03-11T15:24:11+00:00',
        slug: 'dj-irisss-frequencies',
        replays: [
          { label: 'Update van 11 maart 2026', url: 'https://www.radioaccent.be/assets/mixen/frequencies/latest.mp3', updatedAt: '2026-03-11T15:24:11+00:00', note: 'Laatste upload vanuit de mix-feed.' },
          { label: 'Replay van 27 februari 2026', url: 'https://www.radioaccent.be/assets/mixen/frequencies/latest.mp3', updatedAt: '2026-02-27T21:58:00+00:00', note: 'Vorige editie met dezelfde host.' }
        ]
      },
      {
        title: "L'ATTITUDE FM - UUR1",
        dj: 'DJ SMOOTH',
        schedule: 'Elke vrijdag avond tussen 22 en 23 uur',
        description: 'Smooth tunes to start the weekend.',
        streamUrl: "https://www.radioaccent.be/assets/mixen/l'attitude/uur1/latest.mp3",
        cover: "https://www.radioaccent.be/assets/mixen/l'attitude/uur1/cover.jpg",
        updatedAt: '2026-03-11T15:18:58+00:00',
        slug: 'smooth-l-attitude-uur1',
        replays: [
          { label: 'Uur 1 - laatste versie', url: "https://www.radioaccent.be/assets/mixen/l'attitude/uur1/latest.mp3", updatedAt: '2026-03-11T15:18:58+00:00', note: 'Actuele replay voor het eerste uur.' }
        ]
      },
      {
        title: "L'ATTITUDE FM - UUR2",
        dj: 'DJ SMOOTH',
        schedule: 'Elke vrijdag avond tussen 23 en 24 uur',
        description: 'Smooth tunes to start the weekend.',
        streamUrl: "https://www.radioaccent.be/assets/mixen/l'attitude/uur2/latest.mp3",
        cover: "https://www.radioaccent.be/assets/mixen/l'attitude/uur2/cover.jpg",
        updatedAt: '2026-03-11T15:20:02+00:00',
        slug: 'smooth-l-attitude-uur2',
        replays: [
          { label: 'Uur 2 - laatste versie', url: "https://www.radioaccent.be/assets/mixen/l'attitude/uur2/latest.mp3", updatedAt: '2026-03-11T15:20:02+00:00', note: 'Actuele replay voor het tweede uur.' }
        ]
      }
    ],
    news: [
      {
        date: '18 maart 2026',
        title: 'Radio Accent bundelt nieuws, acties en events in een nieuwe stroom',
        excerpt: 'Lokale updates, wedstrijden en stationnieuws staan nu samen in een snellere en nettere nieuwsflow.',
        linkLabel: 'Lees het nieuws',
        linkUrl: 'nieuws.html',
        image: '',
        pinned: true
      },
      {
        date: '17 maart 2026',
        title: 'Accent Drive zoekt jouw filetips uit de regio',
        excerpt: 'Zie je een hinder of omleiding? Laat het weten en wij nemen het mee in de updateflow op antenne.',
        linkLabel: 'Stuur een tip',
        linkUrl: 'contact.html',
        image: '',
        pinned: false
      },
      {
        date: '15 maart 2026',
        title: 'Wekelijkse mixen zijn nu online te herbeluisteren',
        excerpt: 'De recentste mixprogramma\'s kregen een vaste replayplek met cover, omschrijving en directe playerkoppeling.',
        linkLabel: 'Open mixen',
        linkUrl: 'mixen.html',
        image: '',
        pinned: false
      }
    ],
    newsFeed: {
      enabled: false,
      url: '',
      limit: 6,
      cacheMinutes: 15
    },
    siteStatus: {
      enabled: false,
      tone: 'info',
      title: 'Live update',
      message: '',
      ctaLabel: '',
      ctaLink: ''
    }
  },
  contact: {
    email: 'info@radioaccent.be',
    phone: '',
    apiEndpoint: 'api/contact.php',
    addressLine1: 'Bookmolenstraat 7',
    addressLine2: '9230 Wetteren'
  }
};
