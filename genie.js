/** 
 * genie.js @license
 * (c) 2013 Kent C. Dodds
 * genie.js may be freely distributed under the MIT license.
 * http://www.github.com/kentcdodds/genie
 * See README.md
 */

(function (root, factory) {
  'use strict';
  
  if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    root.genie = factory();
  }
}(this, function() {
  'use strict';

  var genie = null; // Library object
  var _wishes = {},
    _previousId = 0,
    _enteredMagicWords = {},
    _defaultContext = ['universe'],
    _context = _defaultContext,
    _pathContexts = [],
    _previousContext = _defaultContext,
    _enabled = true,
    _returnOnDisabled = true,
    
    _contextRegex = /\{\{(\d+)\}\}/,
    _matchRankMap = {
      equals: 6,
      startsWith: 5,
      wordStartsWith: 4,
      contains: 3,
      acronym: 2,
      matches: 1,
      noMatch: 0
    };
  
  /**
   * A wish object has the following parameters:
   *  id: Unique identifier for the wish. This should be a string
   *  context: The context of the wish. Can be a string, array,
   *    or an object optional properties (strings/arrays) of 'all',
   *    'none', and 'any'. If a string or array is given, it's
   *    treated as if it were assigned to the 'any' property.
   *  data: Any data you wish to associate with the wish.
   *    Genie adds a "timesMade" property on this object
   *    and increments it each time this wish is made.
   *  magicWords: Used to match this wish on genie.getMatchingWishes
   *  action: The action to be performed when genie.makeWish is
   *    called with this wish.
   * 
   * @param wish
   * @returns {*} The registered wish or array of wishes.
   */
  function registerWish(wish) {
    if (_isArray(wish)) {
      var wishesRegistered = [];
      _each(wish, function(w) {
        wishesRegistered.push(registerWish(w));
      });
      return wishesRegistered;
    } else {
      var id = wish.id || 'g-' + _previousId++;
      var newWish = {
        id: id,
        context: wish.context || _defaultContext,
        data: wish.data || {},
        magicWords: _arrayize(wish.magicWords),
        action: _createAction(wish.action)
      };
      newWish.data.timesMade = 0;
      _wishes[id] = newWish;
      
      return _wishes[id];
    }
  }

  function _createAction(action) {
    if (_isString(action)) {
      action = {
        destination: action
      };
    }
    if (_isObject(action)) {
      return function() {
        if (action.openNewTab) {
          window.open(action.destination, '_blank');
        } else {
          window.location.href = action.destination;
        }
      };
    }
    
    return action;
  }

  function deregisterWish(id) {
    // Check if it may be a wish object
    if (_isObject(id) && id.id) {
      id = id.id;
    }
    var wish = _wishes[id];
    delete _wishes[id];
    _each(_enteredMagicWords, function(wishIds, word) {
      if (wishIds.indexOf(id) !== -1) {
        _enteredMagicWords[word].splice(wishIds.indexOf(id), 1);
      }
      if (!_enteredMagicWords[word].length) {
        delete _enteredMagicWords[word];
      }
    });
    return wish;
  }
  
  function deregisterWishesWithContext(context) {
    var deregisteredWishes = getWishes(context);
    _each(deregisteredWishes, function(wish, i) {
      deregisteredWishes[i] = deregisterWish(wish);
    });
    return deregisteredWishes;
  }

  /**
   * Get wishes in a specific context. If no context
   *   is provided, all wishes are returned.
   * @param context
   * @returns {Array}
   */
  function getWishes(context) {
    context = context || _defaultContext;
    var wishesInContext = [];
    _each(_wishes, function(wish) {
      if (_wishInThisContext(wish, context)) {
        wishesInContext.push(wish);
      }
    });
    return wishesInContext;
  }

  /**
   * Get a specific wish by an id.
   * If the id is an array, returns an array
   *   of wishes with the same order as the
   *   given array.
   * Note: If the id does not correspond to
   *   a registered wish, it will be undefined
   * @param id
   * @returns {*}
   */
  function getWish(id) {
    if (_isArray(id)) {
      var wishes = [];
      _each(id, function(wishId) {
        wishes.push(_wishes[wishId]);
      });
      return wishes;
    } else {
      return _wishes[id];
    }
  }

  /**
   * Sets genie's options to the default options
   * @returns {{
   *   wishes: {wish},
   *   previousId: number,
   *   enteredMagicWords: {Map, of, words, and, wishes},
   *   context: Array,
   *   previousContext: Array,
   *   enabled: boolean
   * }}
   */
  function reset() {
    var oldOptions = options();
    options({
      wishes: {},
      noWishMerge: true,
      previousId: 0,
      enteredMagicWords: {},
      context: _defaultContext,
      previousContext: _defaultContext,
      enabled: true
    });
    return oldOptions;
  }

  function getMatchingWishes(magicWord) {
    magicWord = magicWord || '';
    var allWishIds = _enteredMagicWords[magicWord] || [];

    var otherMatchingWishId = _getOtherMatchingMagicWords(allWishIds, magicWord);
    allWishIds = allWishIds.concat(otherMatchingWishId);

    var matchingWishes = [];
    _each(allWishIds, function(id) {
      var wish = _wishes[id];
      if (wish && _wishInContext(wish)) {
        matchingWishes.push(wish);
      }
    });
    return matchingWishes;
  }

  function _getOtherMatchingMagicWords(currentMatchingWishIds, givenMagicWord) {
    var matchIdArrays = [];
    var returnedIds = [];
    _each(_wishes, function(wish, wishId) {
      if (!_contains(currentMatchingWishIds, wishId)) {
        var matchType = _bestMagicWordsMatch(wish.magicWords, givenMagicWord);
        if (matchType !== _matchRankMap.noMatch) {
          matchIdArrays[matchType] = matchIdArrays[matchType]  || [];
          matchIdArrays[matchType].push(wishId);
        }
      }
    });
    for (var i = matchIdArrays.length; i > 0; i--) {
      var arry = matchIdArrays[i - 1];
      if (arry) {
        returnedIds = returnedIds.concat(arry);
      }
    }
    return returnedIds;
  }

  function _bestMagicWordsMatch(wishesMagicWords, givenMagicWord) {
    var bestMatch = _matchRankMap.noMatch;
    _each(wishesMagicWords, function(wishesMagicWord) {
      var matchRank = _stringsMatch(wishesMagicWord, givenMagicWord);
      if (matchRank > bestMatch) {
        bestMatch = matchRank;
      }
      return bestMatch !== _matchRankMap.equals;
    });
    return bestMatch;
  }

  function _stringsMatch(magicWord, givenMagicWord) {
    magicWord = ('' + magicWord).toLowerCase();
    givenMagicWord = ('' + givenMagicWord).toLowerCase();

    // too long
    if (givenMagicWord.length > magicWord.length) {
      return _matchRankMap.noMatch;
    }

    // equals
    if (magicWord === givenMagicWord) {
      return _matchRankMap.equals;
    }

    // starts with
    if (magicWord.indexOf(givenMagicWord) === 0) {
      return _matchRankMap.startsWith;
    }

    // word starts with
    if (magicWord.indexOf(' ' + givenMagicWord) !== -1) {
      return _matchRankMap.wordStartsWith;
    }

    // contains
    if (magicWord.indexOf(givenMagicWord) !== -1) {
      return _matchRankMap.contains;
    } else if (givenMagicWord.length === 1) {
      // If the only character in the given magic word
      //   isn't even contained in the magic word, then
      //   it's definitely not a match.
      return _matchRankMap.noMatch;
    }

    // acronym
    if (_getAcronym(magicWord).indexOf(givenMagicWord) !== -1) {
      return _matchRankMap.acronym;
    }

    return _stringsByCharOrder(magicWord, givenMagicWord);
  }
  
  function _getAcronym(string) {
    var acronym = '';
    var wordsInString = string.split(' ');
    _each(wordsInString, function(wordInString) {
      var splitByHyphenWords = wordInString.split('-');
      _each(splitByHyphenWords, function(splitByHyphenWord) {
        acronym += splitByHyphenWord.substr(0, 1);
      });
    });
    return acronym;
  }

  function _stringsByCharOrder(magicWord, givenMagicWord) {
    var charNumber = 0;
    for (var i = 0; i < givenMagicWord.length; i++) {
      var matchChar = givenMagicWord[i];
      var found = false;
      for (var j = charNumber; j < magicWord.length; j++) {
        var stringChar = magicWord[j];
        if (stringChar === matchChar) {
          found = true;
          charNumber = j + 1;
          break;
        }
      }
      if (!found) {
        return _matchRankMap.noMatch;
      }
    }
    return _matchRankMap.matches;
  }

  function makeWish(wish, magicWord) {
    // Check if it may be a wish object
    if (!_isObject(wish)) {
      wish = _wishes[wish];
    }
    if (_isNullOrUndefined(wish)) {
      var matchingWishes = getMatchingWishes(magicWord);
      if (matchingWishes.length > 0) {
        wish = matchingWishes[0];
      }
    }

    /* Don't execute the wish and return null if it:
     *   - doesn't exist
     *   - isn't in the registry
     *   - doesn't have an action
     *   - wish is not in context
     */
    if (!wish || !_wishes[wish.id] || !wish.action || !(_wishInContext(wish))) {
      return null;
    }

    wish.action(wish, magicWord);
    wish.data.timesMade++;
    if (!_isNullOrUndefined(magicWord)) {
      _updateEnteredMagicWords(wish, magicWord);
    }
    return wish;
  }

  /**
   * There are a few ways for a wish to be in context:
   *  1. Genie's context is equal to the default context
   *  2. The wish's context is equal to the default context
   *  3. The wish's context is equal to genie's context
   *  4. The wish is _wishInThisContext(_context)
   * @param wish
   * @returns {*}
   * @private
   */
  function _wishInContext(wish) {
    function contextIsDefault(context) {
      context = _arrayize(context);
      if (context.length === 1) {
        return context[0] === _defaultContext[0];
      }
    }
    return contextIsDefault(_context) ||
      contextIsDefault(wish.context) ||
      wish.context === _context ||
      _wishInThisContext(wish, _context);
  }

  /**
   * This will get the any, all, and none constraints for the
   *   wish's context. If the wish's context is an array or string
   *   it will consider it to be the wish's any constraint.
   *   If a constraint is not present, it is considered to pass.
   *   The exception being if the wish has no context (each context
   *   property is not present). In this case, it is not in context.
   * These things must be true for the wish to be in the given context:
   *  1. any: genie's context contains any of these.
   *  2. all: genie's context contains all of these.
   *  3. none: genie's context contains none of these.
   *   
   * @param wish
   * @param theContexts
   * @returns {boolean}
   * @private
   */
  function _wishInThisContext(wish, theContexts) {
    var wishContextConstraintsMet = false;
    
    var any = wish.context.any || [];
    var all = wish.context.all || [];
    var none = wish.context.none || [];
    
    if (_isString(wish.context)) {
      any = [wish.context];
    } else if (_isArray(wish.context)) {
      any = wish.context;
    }

    if (all || none || any) {
      var containsAny = _isEmpty(any) || _arrayContainsAny(theContexts, any);
      var containsAll = theContexts.length >= all.length && _arrayContainsAll(theContexts, all);
      var wishNoneContextNotContainedInContext = _arrayContainsNone(theContexts, none);
      
      wishContextConstraintsMet = containsAny && containsAll && wishNoneContextNotContainedInContext;
    }

    return wishContextConstraintsMet;
  }

  /**
   * Updates the _enteredMagicWords map. Steps:
   *  1. Get or create a spot for the magic word in the map.
   *  2. If the wish is the first element in the map already,
   *    do nothing. (return)
   *  3. If the wish already exists in the map, remove it.
   *  4. If the wish was not already the second element,
   *    set is as the second element. If it was, set it
   *    as the first element.
   * @param wish
   * @param magicWord
   * @private
   */
  function _updateEnteredMagicWords(wish, magicWord) {
    // Reset entered magicWords order.
    _enteredMagicWords[magicWord] = _enteredMagicWords[magicWord] || [];
    var id = wish.id;
    var arry = _enteredMagicWords[magicWord];
    var existingIndex = arry.indexOf(id);
    if (existingIndex !== 0) {
      if (existingIndex !== -1) {
        // If it already exists, remove it before re-adding it in the correct spot
        arry.splice(existingIndex, 1);
      }
      if (existingIndex !== 1 && arry.length > 0) {
        // If it's not "on deck" then put it in the first slot and set the King of the Hill to be the id to go first.
        var first = arry[0];
        arry[0] = id;
        id = first;
      }
      arry.unshift(id);
    }
  }

  /**
   * Gets the context paths that should be added based on the
   *   given path and the context paths that should be removed
   *   based ont he given path
   * @param path
   * @returns {{add: Array, remove: Array}}
   * @private
   */
  function _getContextsFromPath(path) {
    var allContexts = {
      add: [],
      remove: []
    };
    _each(_pathContexts, function(pathContext) {
      var contextAdded = false;
      var contexts = _arrayize(pathContext.contexts);
      var regexes = _arrayize(pathContext.regexes);
      var paths = _arrayize(pathContext.paths);

      _each(regexes, function(regex) {
        regex.lastIndex = 0;
        var matches = regex.exec(path);
        if (matches && matches.length > 0) {
          var contextsToAdd = [];
          _each(contexts, function(context) {
            var replacedContext = context.replace(_contextRegex, function(match, group) {
              return matches[group];
            });
            contextsToAdd.push(replacedContext);
          });
          allContexts.add = allContexts.add.concat(contextsToAdd);
          contextAdded = true;
        }
        return !contextAdded;
      });

      if (!contextAdded) {
        _each(paths, function(pathToTry) {
          if (path === pathToTry) {
            allContexts.add = allContexts.add.concat(contexts);
            contextAdded = true;
          }
          return !contextAdded;
        });
        if (!contextAdded) {
          allContexts.remove = allContexts.remove.concat(contexts);
        }
      }
    });
    return allContexts;
  }

  /**
   * Gets all the pathContext.contexts that are regex contexts and matches
   *   those to genie's contexts. Returns all the matching contexts.
   * @returns {Array}
   * @private
   */
  function _getContextsMatchingRegexPathContexts() {
    var regexContexts = [];
    _each(_pathContexts, function(pathContext) {
      var contexts = pathContext.contexts;

      _each(contexts, function(context) {

        if (_contextRegex.test(context)) { // context string is a regex context
          var replaceContextRegex = context.replace(_contextRegex, '.+?');

          _each(_context, function(currentContext) {
            if (new RegExp(replaceContextRegex).test(currentContext)) {
              regexContexts.push(currentContext);
            }

          });
        }
      });
    });
    return regexContexts;
  }
  
  // Helpers //
  /**
   * returns the obj in array form if it is not one already
   * @param obj
   * @returns {Array}
   * @private
   */
  function _arrayize(obj) {
    if (!obj) {
      return [];
    } else if (_isArray(obj)) {
      return obj;
    } else {
      return [obj];
    }
  }

  /**
   * Adds items to the arry from the obj only if it
   *   is not in the arry already
   * @param arry
   * @param obj
   * @private
   */
  function _addUniqueItems(arry, obj) {
    obj = _arrayize(obj);
    for (var i = 0; i < obj.length; i++) {
      if (arry.indexOf(obj[i]) < 0) {
        arry.push(obj[i]);
      }
    }
  }

  /**
   * Removes all instances of items in the given obj
   *   from the given arry.
   * @param arry
   * @param obj
   * @private
   */
  function _removeItems(arry, obj) {
    obj = _arrayize(obj);
    var i = 0;

    while(i < arry.length) {
      if (_contains(obj, arry[i])) {
        arry.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  /**
   * Returns true if arry1 contains any of arry2's elements
   * @param arry1
   * @param arry2
   * @returns {boolean}
   * @private
   */
  function _arrayContainsAny(arry1, arry2) {
    arry1 = _arrayize(arry1);
    arry2 = _arrayize(arry2);
    for (var i = 0; i < arry2.length; i++) {
      if (_contains(arry1, arry2[i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns true if arry1 does not contain any of arry2's elements
   * @param arry1
   * @param arry2
   * @returns {boolean}
   * @private
   */
  function _arrayContainsNone(arry1, arry2) {
    arry1 = _arrayize(arry1);
    arry2 = _arrayize(arry2);
    for (var i = 0; i < arry2.length; i++) {
      if (_contains(arry1, arry2[i])) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns true if arry1 contains all of arry2's elements
   * @param arry1
   * @param arry2
   * @returns {boolean}
   * @private
   */
  function _arrayContainsAll(arry1, arry2) {
    arry1 = _arrayize(arry1);
    arry2 = _arrayize(arry2);
    for (var i = 0; i < arry2.length; i++) {
      if (!_contains(arry1, arry2[i])) {
        return false;
      }
    }
    return true;
  }

  function _contains(arry, obj) {
    return arry.indexOf(obj) > -1;
  }

  function _isEmpty(obj) {
    if (_isNullOrUndefined(obj)) {
      return true;
    } else if (_isArray(obj)) {
      return obj.length === 0;
    } else if (_isPrimitive(obj)) {
      return false;
    } else {
      return false;
    }
  }

  /**
   * Iterates through each own property of obj and calls the fn on it.
   *   If obj is an array: fn(val, index, obj)
   *   If obj is an obj: fn(val, propName, obj)
   * @param obj
   * @param fn
   * @private
   */
  function _each(obj, fn) {
    var ret;
    if (_isPrimitive(obj)) {
      obj = _arrayize(obj);
    }
    if (_isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        ret = fn(obj[i], i, obj);
        if (typeof ret === 'boolean' && !ret) {
          break;
        }
      }
    } else {
      /*jshint maxdepth:4*/
      for (var prop in obj) {
        if (obj.hasOwnProperty(prop)) {
          ret = fn(obj[prop], prop, obj);
          if (typeof ret === 'boolean' && !ret) {
            break;
          }
        }
      }
    }
  }

  function _isArray(obj) {
    return obj instanceof Array;
  }

  function _isString(obj) {
    return typeof obj === 'string';
  }

  function _isObject(obj) {
    return typeof obj === 'object';
  }

  function _isPrimitive(obj) {
    switch (typeof obj) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'undefined':
        return true;
      default:
        return false;
    }
  }

  function _isUndefined(obj) {
    return typeof obj === 'undefined';
  }

  function _isNull(obj) {
    return obj === null;
  }
  
  function _isNullOrUndefined(obj) {
    return _isNull(obj) || _isUndefined(obj);
  }

  // Begin API functions. //
  /**
   * An api into genie's options
   * The opts argument can have the following properties:
   *  - wishes: object - Must be an object mapped by wish ids
   *  - noWishMerge: boolean - Using this will simply assign the
   *    given wishes to genie's _wishes variable. If falsy, then
   *    genie.mergeWishes is called with the wishes.
   *  - previousId: number - This is used to assign wish ids when
   *    the id is not provided when registering a wish. This number
   *    is bumped up with every new wish. Changing this without
   *    resetting wishes could lead to wish overrides.
   *  - enteredMagicWords: object - A mapping of words (key) to
   *    an array of wish ids.
   *  - context: string or array of strings - genie's context
   *  - previousContext: string or array of strings - genie's
   *    previousContext. Used for genie.revertContext().
   *  - enabled: boolean - Whether genie is enabled. If set to
   *    false, this will cause only genie's enabled function
   *    to work (so you can turn it back on).
   *  - returnOnDisabled: boolean - If enabled is false, genie
   *    will simulate proper functionality by returning empty
   *    objects/arrays/strings/etc. This way you don't have to
   *    do a bunch of checking around all of your genie code.
   *    However, if you want to turn this off, set this to
   *    false and you will get null back for everything when
   *    genie is disabled.
   *    
   * @param opts
   * @returns {
   *  {
   *    wishes: {wish},
   *    previousId: number,
   *    enteredMagicWords: {Map of words and wishes},
   *    context: Array,
   *    previousContext: Array,
   *    enabled: boolean
   *  }
   * }
   */
  function options(opts) {
    if (opts) {
      if (opts.wishes) {
        if (opts.noWishMerge) {
          _wishes = opts.wishes;
        } else {
          mergeWishes(opts.wishes);
        }
      }
      _previousId = opts.previousId || _previousId;
      _enteredMagicWords = opts.enteredMagicWords || _enteredMagicWords;
      _context = opts.context || _context;
      _previousContext = opts.previousContext || _previousContext;
      _enabled = opts.enabled || _enabled;
      _returnOnDisabled = opts.returnOnDisabled || _returnOnDisabled;
    }
    return {
      wishes: _wishes,
      previousId: _previousId,
      enteredMagicWords: _enteredMagicWords,
      context: _context,
      previousContext: _previousContext,
      enabled: _enabled
    };
  }

  /**
   * Merges the given wishes with genie's current wishes.
   * Iterates through the wishes: If the wish does not have
   *   an action, and the wish's id is registered with genie,
   *   genie will assign the registered wish's action to
   *   the new wish's action property.
   *   Next, if the new wish has an action, it is registered
   *   with genie based on its wishId
   * @param wishes - Mapping of wishIds to wish objects.
   *   Note: The wish's wish id need not be set. It will be
   *   set/overridden by this function based on the property
   *   name.
   * @returns {{}}
   */
  function mergeWishes(wishes) {
    _each(wishes, function(newWish, wishId) {
      newWish.id = wishId;
      if (!newWish.action && _wishes[wishId]) {
        newWish.action = _wishes[wishId].action;
      }
      if (newWish.action) {
        _wishes[wishId] = newWish;
      }
    });
    return _wishes;
  }

  /**
   * Set's then returns genie's current context.
   * If no context is provided, simply acts as getter.
   * If a context is provided, genie's previous context
   *   is set to the context before it is assigned
   *   to the given context.
   * @param newContext
   * @returns {Array}
   */
  function context(newContext) {
    if (newContext !== undefined) {
      _previousContext = _context;
      if (typeof newContext === 'string') {
        newContext = [newContext];
      }
      _context = newContext;
    }
    return _context;
  }

  /**
   * Adds the new context to genie's current context.
   * Genie's context will maintain uniqueness, so don't
   *   worry about overloading genie's context with
   *   duplicates.
   * @param newContext (string or array of strings)
   * @returns {Array}
   */
  function addContext(newContext) {
    _previousContext = _context;
    _addUniqueItems(_context, newContext);
    return _context;
  }

  /**
   * Removes the given context
   * @param contextToRemove
   * @returns {Array}
   */
  function removeContext(contextToRemove) {
    _previousContext = _context;
    _removeItems(_context, contextToRemove);
    if (_isEmpty(context)) {
      _context = _defaultContext;
    }
    return _context;
  }

  /**
   * Changes genie's context to _previousContext
   * @returns {Array}
   */
  function revertContext() {
    return context(_previousContext);
  }

  /**
   * Changes context to _defaultContext
   * @returns {Array}
   */
  function restoreContext() {
    return context(_defaultContext);
  }

  /**
   * Updates genie's context based on the given path
   * @param path - the path to match
   * @param noDeregister - Do not deregister wishes
   *   which are no longer in context
   * @returns {Array} - The new context
   */
  function updatePathContext(path, noDeregister) {
    if (path) {
      var allContexts = _getContextsFromPath(path);
      var contextsToAdd = allContexts.add;
      var contextsToRemove = _getContextsMatchingRegexPathContexts();
      contextsToRemove = contextsToRemove.concat(allContexts.remove);

      removeContext(contextsToRemove);

      if (!noDeregister) {
        // There's no way to prevent users of genie from adding wishes that already exist in genie
        //   so we're completely removing them here
        deregisterWishesWithContext(contextsToRemove);
      }

      addContext(contextsToAdd);
    }
    return _context;
  }

  /**
   * A pathContext is an array of objects with
   *   the following properties:
   *     - paths: string or array of strings
   *     - regexes: regex objects or array of
   *       regex objects
   *     - contexts: string or array of strings
   * @param pathContext
   * @returns {Array} - The new path contexts
   */
  function addPathContext(pathContext) {
    _addUniqueItems(_pathContexts, pathContext);
    return _pathContexts;
  }

  /**
   * Removes the given path contexts
   * @param pathContext
   * @returns {Array}
   */
  function removePathContext(pathContext) {
    _removeItems(_pathContexts, pathContext);
    return _pathContexts;
  }

  function enabled(newState) {
    if (newState !== undefined) {
      _enabled = newState;
    }
    return _enabled;
  }

  function returnOnDisabled(newState) {
    if (newState !== undefined) {
      _returnOnDisabled = newState;
    }
    return _returnOnDisabled;
  }

  /**
   * Used to hijack public api functions for the
   *   enabled feature
   * @param fn
   * @param emptyRetObject
   * @returns {Function}
   * @private
   */
  function _passThrough(fn, emptyRetObject) {
    return function hijackedFunction() {
      if (_enabled || fn === enabled) {
        return fn.apply(this, arguments);
      } else if (_returnOnDisabled) {
        return emptyRetObject;
      } else {
        return null;
      }
    };
  }

  genie = _passThrough(registerWish, {});
  genie.getWishes = _passThrough(getWishes, []);
  genie.getWish = _passThrough(getWish, {});
  genie.getMatchingWishes = _passThrough(getMatchingWishes, []);
  genie.makeWish = _passThrough(makeWish, {});
  genie.options = _passThrough(options, {});
  genie.mergeWishes = _passThrough(mergeWishes, {});
  genie.deregisterWish = _passThrough(deregisterWish, {});
  genie.deregisterWishesWithContext = _passThrough(deregisterWishesWithContext, []);
  genie.reset = _passThrough(reset, {});
  genie.context = _passThrough(context, []);
  genie.addContext = _passThrough(addContext, []);
  genie.removeContext = _passThrough(removeContext, []);
  genie.revertContext = _passThrough(revertContext, []);
  genie.restoreContext = _passThrough(restoreContext, []);
  genie.updatePathContext = _passThrough(updatePathContext, []);
  genie.addPathContext = _passThrough(addPathContext, []);
  genie.removePathContext = _passThrough(removePathContext, []);
  genie.enabled = _passThrough(enabled, false);
  genie.returnOnDisabled = _passThrough(returnOnDisabled, true);
  return genie;

}));
