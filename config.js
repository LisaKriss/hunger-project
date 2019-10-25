require('dotenv').config()
const src = 'app'
const dest = 'dist'
const assets = src + '/assets'
const languages = [
  'en', 'de'
]

const config = {
  src: src,
  dest: dest,
  assets: assets,

  environment: {
    baseUrl: process.env.BASE_URL || "",
    env: process.env.ENV || "prod",
    renderAllLanguages: process.env.RENDER_ALL_LANGUAGES || false
  },

  js: {
    src: assets + '/js/**/*.js',
    dest: dest + '/js'
  },

  scss: {
    srcBuild: assets + '/scss/*.+(scss|sass)',
    srcWatch: assets + '/scss/**/*.+(scss|sass)',
    dest: dest + '/css'
  },

  njk: {
    allSrc: src + '/**/*.+(nj|njk|nunjucks)',
    pageSrc: src + '/pages/**/*.+(nj|njk|nunjucks)',
    templatesSrc: src + '/templates',
    dest: dest
  },

  app: {
    globalData: [],
    languages: languages,
    defaultLanguage: 'en',
    markdownOptions: {
      smartypants: true,
      gfm: true
    },
    templatesPath: src + '/templates',
    pageSrc: src + '/pages/**/*.njk',
    pageDest: dest,
    watch: [
      src + '/templates/**/*',
      './data/**/*.json'
    ],
    destWatch: dest + '/**/*'
  },

  browserSync: {
    host: 'localhost',
    port: 3000
  },

  gettext: {
    languages: languages,
    mainSourceFolder: './',
    sources: ['./app/templates', './app/pages'],
    dataSources: ['./data']
  },

  data: {
    src: "data",
    dataList: [
      './data/global.json',
      './data/metas.json',
      './data/languages-map.json',
      './data/pages-data/index.json'
    ]
  }
}

module.exports = config
