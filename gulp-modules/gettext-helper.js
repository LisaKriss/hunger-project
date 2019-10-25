const _ = require('lodash')
const fs = require('fs')
const recursiveReadSync = require('recursive-readdir-sync')
const path = require('path')
const upath = require('upath')
const objectPath = require('object-path')
const gutil = require('gulp-util')
const xgettext = require('xgettext-template')
const gettextParser = require('gettext-parser')
const stripJSONComments = require('strip-json-comments')
const config = require('../config')

// Constructor.
var gettextHelper = function () {
}

// Load all files which contain gettext strings into an array.
gettextHelper.prototype.gettextSources = function (gettextDirectories) {
    var sources = []

    for (var i in gettextDirectories) {
        const directory = gettextDirectories[i]

        var files
        try {
            files = recursiveReadSync(directory)
        } catch (err) {
            throw err
        }

        for (var j in files) {
            const file = files[j]

            if (/^.*\.(njk|json)$/.test(file)) {
                sources.push(upath.normalize(file))
            }
        }
    }

    return sources
}

// Gets JSON data from file path and assign to given data object
gettextHelper.prototype.getDataFromSource = function (filepath, returnedData) {
    try {
        var data = JSON.parse(stripJSONComments(fs.readFileSync(filepath).toString()))
        returnedData = _.assign(returnedData, data)
    } catch (e) {
        gutil.log(gutil.colors.red(`Data in ${filepath} is not valid JSON`))
    }

    return returnedData
}

// Check every prop of item (used for gettext extraction of json file data).
// Convert found items to Nunjucks syntax.
gettextHelper.prototype.readDataObject = function (item, context) {
    var stringCollection = []

    function propsWalker (item, context) {
        for (var prop in item) {
            if (item.hasOwnProperty(prop)) {
                if (item[prop] !== null && typeof item[prop] === 'object') {
                    propsWalker(item[prop], context)
                } else {
                    if (typeof item[prop] === 'string' && /^\~i18n\:\s.+/i.test(item[prop])) {
                        var detectedItem = item[prop].substring('~i18n:'.length)
                        stringCollection.push('{{ pgettext(\'' + context + '\', \'' + detectedItem.trim() + '\') }}')
                    }
                }
            }
        }
    }

    propsWalker(item, context)
    return stringCollection
}

// Generate context from filepath.
gettextHelper.prototype.getContextName = function (filepath) {
    return 'Data: ' + path.basename(filepath)
}

// Function to map diff between objects.
gettextHelper.prototype.comparePOObjects = function (a, b) {
    function compare (a, b) {
        var result = {
            different: [],
            missing_from_first: [],
            missing_from_second: [],
        }

        _.reduce(a, function (result, value, key) {
            if (b[key] != undefined) {
                if (_.isEqual(value, b[key])) {
                    return result
                } else {
                    if (typeof (a[key]) != typeof ({}) || typeof (b[key]) != typeof ({})) {
                        //dead end.
                        result.different.push(key)
                        return result
                    } else {
                        var deeper = compare(a[key], b[key])
                        result.different = result.different.concat(_.map(deeper.different, (sub_path) => {
                            return key + '<-split->' + sub_path
                        }))

                        result.missing_from_second = result.missing_from_second.concat(_.map(deeper.missing_from_second, (sub_path) => {
                            return key + '<-split->' + sub_path
                        }))

                        result.missing_from_first = result.missing_from_first.concat(_.map(deeper.missing_from_first, (sub_path) => {
                            return key + '<-split->' + sub_path
                        }))
                        return result
                    }
                }
            } else {
                result.missing_from_second.push(key)
                return result
            }
        }, result)

        _.reduce(b, function (result, value, key) {
            if (a[key] != undefined) {
                return result
            } else {
                result.missing_from_first.push(key)
                return result
            }
        }, result)

        return result
    }

    return compare(a, b)
}

// Private merge deep.
// Merge existing translations with new.
var mergeDeep = function (target, source) {
    var dummy
    if (_.isObject(target) && _.isObject(source)) {
        for (var key in source) {
            if (_.isObject(source[key])) {
                if (!target[key]) {
                    dummy = {}
                    dummy[key] = {}
                    _.assign(target, dummy)
                }
                mergeDeep(target[key], source[key])
            } else {
                dummy = {}
                dummy[key] = source[key]
                _.assign(target, dummy)
            }
        }
    }

    return target
}

// Merge two translations objects.
gettextHelper.prototype.merge = function (newTranslations, oldTranslations, cleanup) {
    // Compare language files.
    // Register strings that are not present in the new translation object, but are present in the old translation object.
    var diff = this.comparePOObjects(oldTranslations, newTranslations)
    var removedStrings = diff.missing_from_second

    // Delete removed strings from the old translation object.
    if (cleanup) {
        for (var i in removedStrings) {
            var index = removedStrings[i].split('<-split->')
            objectPath.del(oldTranslations, index)
        }
    }

    // Deep merge to the new translations object.
    var updatedObject = _.merge(newTranslations, oldTranslations)

    // Return final updated object.
    return updatedObject
}

gettextHelper.prototype.extract = function (sources, extractionType, callback) {
    // Prepare source.
    var gettextSource = ''
    if (extractionType == 'dataExtraction') {
        var stringCollection = ['']
        var dataFiles = this.gettextSources(sources)


        // Walk through every file and extract to the collection translatable strings.
        for (var i in dataFiles) {
            var dataFile = dataFiles[i]

            // Add found translatable strings to collection.
            var loadedData = this.getDataFromSource(dataFile, {})


            stringCollection = stringCollection.concat(this.readDataObject(loadedData, this.getContextName(dataFile)))
        }

        // Convert collection to string.
        gettextSource = stringCollection.join(' ')
    } else {
        gettextSource = this.gettextSources(sources)
    }

    // Extract all gettext strings.
    var xgettextOptions = {
        directory: config.gettext.mainSourceFolder,
        output: '-',
        language: 'Nunjucks',
        'from-code': 'utf8',
        keyword: ['gettext', '_', 'dgettext:2', '_d:2', 'ngettext:1,2', '_n:1,2', 'dngettext:2,3', '_dn:2,3',
            'pgettext:1c,2', '_p:1c,2', 'dpgettext:2c,3', '_dp:2c,3', 'npgettext:2c,3,4',
            '_np:2c,3,4', 'dnpgettext:2c,3,4', '_dnp:2c,3,4'],
        'join-existing': true,
        'force-po': true,
    }

    // Asynchronous method.
    xgettext(gettextSource, xgettextOptions, function (po) {
        if (po && (xgettextOptions.output === '-' || xgettextOptions.output === '/dev/stdout')) {
            //process.stdout.write(po);
            var parsedPo = gettextParser.po.parse(po)
            parsedPo.charset = 'utf-8'

            callback(parsedPo)
        }
    })
}

gettextHelper.prototype.stripLanguage = function (lang) {
    return lang.indexOf('-') === -1? lang : lang.substring(0, lang.indexOf('-'))
}

module.exports = gettextHelper
