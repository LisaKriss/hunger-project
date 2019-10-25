const _ = require('lodash')
const fs = require('fs')
const gutil = require('gulp-util')
const path = require('path')
const through = require('through2')
const nunjucks = require('nunjucks')
const Gettext = require('node-gettext')
const gettextParser = require('gettext-parser')
const nunjucksMarkdown = require('nunjucks-markdown')
const marked = require('marked')
const stripJSONComments = require('strip-json-comments')
const moment = require('moment')

// Custom modules
const gettextHelper = new (require('./gettext-helper'))()

// Get config from config.js
const config = require('../config')

function nunjuckTemplate(options, language) {

  // Default values.
  var defaults = {
    templateDir: config.app.templatesPath,
    templateExt: '.njk'
  }

  // Merge defaults with options.
  options = _.assign(defaults, options)

  // Language support.
  var language = language || config.app.defaultLanguage
  var translate = new Gettext()
  var languageFile = fs.readFileSync('locales/' + gettextHelper.stripLanguage(language) + '.po')
  translate.addTranslations(language, 'messages', gettextParser.po.parse(languageFile))
  translate.setLocale(language)

  // Through.
  return through.obj((file, enc, cb) => {
    if (file.isStream()) {
      cb(new gutil.PluginError('nunjucks-template', 'Streaming not supported'))
      return
    }

    // Variables.
    var data = {}
    var localData = file.localData || {}
    var frontmatterData = file.frontmatter || {}
    var markdownData
    var templatePath

    /**
     * Figures out Template Path
     * Priority 1 : options given by user
     * Priority 2 : template in frontmatter
     * Fallback   : Use self
     */
    if (options.template) {
      templatePath = path.join(process.cwd(), options.templateDir, options.template + options.templateExt)
      try {
        fs.openSync(templatePath, 'r')
      } catch (e) {
        cb(pluginError(`${options.template}${options.templateExt} not found in ${options.templateDir}`))
      }

    } else if (!_.isEmpty(frontmatterData) && frontmatterData.template) {
      templatePath = path.join(file.cwd, options.templateDir, frontmatterData.template + options.templateExt)
      try {
        fs.openSync(templatePath, 'r')
      } catch (e) {
        cb(pluginError(`${frontmatterData.template}${options.templateExt} not found in ${options.templateDir}`))
      }
    } else {
      templatePath = file.path
    }

    // Set markdown data to (if any).
    markdownData = file.contents ? {body: file.contents.toString()} : {}

    // Get data from data (if any).
    if (options.data) {
      var sources = options.data
      if (_.isString(sources)) {
        data = getDataFromSource(sources, data, translate)
      } else if (_.isArray(sources)) {
        _.forEach(sources, (source) => {
          data = getDataFromSource(source, data, translate)
        })
      }
    }

    // Get data from additional sources (if any).
    if (file.frontmatter) {
      var sources = file.frontmatter.data || file.frontmatter.sources
      if (_.isString(sources)) {
        localData = getDataFromSource(sources, localData, translate)
      } else if (_.isArray(sources)) {
        _.forEach(sources, (source) => {
          localData = getDataFromSource(source, localData, translate)
        })
      }
    }

    // Add active language and languages to data.
    data = _.assign(data, {
      availableLanguages: config.app.languages,
      defaultLanguage: config.app.defaultLanguage,
      activeLanguage: language
    })

    // Inject dynamic data.
    data.siteUrl = config.environment.baseUrl

    // Inject active env.
    data.activeEnv = config.environment.env

    // Get active page name and inject it with replaced 'index'
    let fileStartStr = '/pages/'
    let fileEndStr = defaults.templateExt

    let activePage = templatePath.substring(templatePath.indexOf(fileStartStr) + fileStartStr.length, templatePath.indexOf(fileEndStr))
    activePage = activePage.replace('index', '').replace('//', '/')
    if (activePage.endsWith('/')) activePage = activePage.substring(0, activePage.length - 1)

    data.activePage = activePage

    // Inject full site url with language and active page
    data.siteFullUrl = data.siteUrl + (language !== undefined && language !== config.app.defaultLanguage ? ('/' + language) : '') + '/' + data.activePage

    // Consolidates data.
    data = _.assign(data, frontmatterData, markdownData, localData)


    // Setup Nunjucks environment
    var environment = new nunjucks.Environment(new nunjucks.FileSystemLoader(
      [options.templateDir, path.join(process.cwd(), 'app/pages')]
    ))

    environment.opts = _.assign(environment.opts, {
      autoescape: false,
      watch: false,
      nocache: true
    })

    // Expose data as globalData.
    environment.addGlobal('globalData', data)

    // Filter for sorting a simple object by value.
    function _sortProperties(object) {
      var sortable = []
      for (var key in object) {
        if (object.hasOwnProperty(key)) {
          sortable.push([key, object[key]])
        }
      }

      sortable.sort(function (a, b) {
        var x = a[1].toLowerCase(),
          y = b[1].toLowerCase()
        return x < y ? -1 : x > y ? 1 : 0
      })

      return sortable // array in format [ [ key1, val1 ], [ key2, val2 ], ... ]
    }

    environment.addFilter('simpleObjectSort', function (object) {
      var sorted = _sortProperties(object)
      var newObject = {}

      for (i in sorted) {
        newObject[sorted[i][0].toString()] = sorted[i][1]
      }

      return newObject
    })

    // Format date filter.
    environment.addFilter('formatDate', function (unixTime) {
      moment.locale(language)
      return moment(unixTime).format('dddd, DD MMMM')
    })

    // Add gettext functions.
    // Expose all gettext functions to global.
    var translateGlobal = translate
    translateGlobal.gettextFunctions = {
      _gettext: {
        alias: '_',
        method: function (msgid) {
          return translateGlobal.gettext(msgid)
        }
      },
      _dgettext: {
        alias: '_d',
        method: function (domain, msgid) {
          return translateGlobal.dgettext(domain, msgid)
        }
      },
      _ngettext: {
        alias: '_n',
        method: function (msgid, msgidPlural, count) {
          return translateGlobal.ngettext(msgid, msgidPlural, count)
        }
      },
      _dngettext: {
        alias: '_dn',
        method: function (domain, msgid, msgidPlural, count) {
          return translateGlobal.dngettext(domain, msgid, msgidPlural, count)
        }
      },
      _pgettext: {
        alias: '_p',
        method: function (msgctxt, msgid) {
          return translateGlobal.pgettext(msgctxt, msgid)
        }
      },
      _dpgettext: {
        alias: '_dp',
        method: function (domain, msgctxt, msgid) {
          return translateGlobal.dpgettext(domain, msgctxt, msgid)
        }
      },
      _npgettext: {
        alias: '_np',
        method: function (msgctxt, msgid, msgidPlural, count) {
          return translateGlobal.npgettext(msgctxt, msgid, msgidPlural, count)
        }
      },
      _dnpgettext: {
        alias: '_dnp',
        method: function (domain, msgctxt, msgid, msgidPlural, count) {
          return translateGlobal.dnpgettext(domain, msgctxt, msgid, msgidPlural, count)
        }
      }
    }

    // Load the 'node-gettext' lib to the Nunjucks environment as 'translate'.
    environment.addGlobal('translate', translateGlobal)

    // Load all gettext functions into global.
    for (var _function in translateGlobal.gettextFunctions) {
      var functionStructure = {
        name: _function.replace('_', ''),
        alias: translateGlobal.gettextFunctions[_function].alias,
        method: translateGlobal.gettextFunctions[_function].method
      }

      environment.addGlobal(functionStructure.name, functionStructure.method).addGlobal(functionStructure.alias, functionStructure.method)
    }

    // Function to load translated markdown.
    environment.addGlobal('translateMarkdown', function (filePath) {
      var base = filePath.split('/')[0]
      return filePath.slice(0, base.length + 1) + language + filePath.slice(base.length)
    })

    // Link pages.
    environment.addFilter('pageLink', function (uri) {
      var url = config.environment.baseUrl
      if (config.environment.env === 'dev')
        url = '//' + config.browserSync.host + ':' + config.browserSync.port

      if (language !== undefined && language !== config.app.defaultLanguage)
        url += ('/' + language)

      return (url + uri)
    })

    // For accessing assets
    environment.addFilter('assetLink', function (uri) {
      var url = config.environment.baseUrl
      if (config.environment.env === 'dev')
        url = '//' + config.browserSync.host + ':' + config.browserSync.port

      return (url + uri)
    })

    // Get url of translated active page.
    environment.addGlobal('getUrlTranslated', function (lang = "") {
      var url = config.environment.baseUrl
      if (config.environment.env === 'dev')
        url = '//' + config.browserSync.host + ':' + config.browserSync.port

      if (lang !== config.app.defaultLanguage)
        url += ('/' + lang)

      return (url + "/" + activePage)
    })

    // Add markdown support to Nunjucks.
    marked.setOptions(config.app.markdownOptions)
    nunjucksMarkdown.register(environment, marked)

    // Render Nunjucks to HTML.
    environment.render(templatePath, data, (err, res) => {
      if (err) cb(pluginError(err))

      file.contents = new Buffer(res)
      cb(null, file)
    })
  })
}

function pluginError(message) {
  return new gutil.PluginError('templator', message)
}

// Gets JSON data from file path and assign to given data object
function getDataFromSource(filepath, returnedData, translate) {
  try {
    // Get data file context name.
    var context = gettextHelper.getContextName(filepath)

    // Translate translatable data strings.
    function propsWalker(item) {
      for (var prop in item) {
        if (item.hasOwnProperty(prop)) {
          if (item[prop] !== null && typeof item[prop] === 'object') {
            propsWalker(item[prop])
          } else {
            if (typeof item[prop] === 'string' && /^\~i18n\:\s.+/i.test(item[prop])) {
              // Remove the "~i18n:" flag and translate the string.
              item[prop] = translate.pgettext(context, item[prop].substring('~i18n:'.length).trim())
            }
          }
        }
      }
    }

    // Return translated data.
    var data = JSON.parse(stripJSONComments(fs.readFileSync(filepath).toString()))

    // Translate strings and merge them.
    propsWalker(data)
    returnedData = _.assign(returnedData, data)
  } catch (e) {
    gutil.log(gutil.colors.red(`Data in ${filepath} is not valid JSON`))
  }

  return returnedData
}

module.exports = nunjuckTemplate
