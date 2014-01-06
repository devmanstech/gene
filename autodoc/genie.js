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
  var _wishes = [],
    _previousId = 0,
    _enteredMagicWords = {},
    _defaultContext = ['universe'],
    _originalMatchingAlgorithm = function() {},
    _context = _defaultContext,
    _pathContexts = [],
    _previousContext = _defaultContext,
    _enabled = true,
    _returnOnDisabled = true,

    _contextRegex = /\{\{(\d+)\}\}/,
    _matchRankMap = {
      equals: 5,
      startsWith: 4,
      wordStartsWith: 3,
      contains: 2,
      acronym: 1,
      matches: 0,
      noMatch: -1
    };

  /**
   * The context of a wish
   * @typedef {Object} context
   * @property {[]} any
   * @property {[]} all
   * @property {[]} none
   */
  
  /**
   * The wish object
   * @typedef {Object} wish
   * @property {string} id - Unique identifier for the wish.
   * @property {context} context - The context of the wish. Can be given as a
   *   string or array. In which case it is assigned to the wish's context.any property.
   * @property {{timesMade: {total: number, magicWords: {string}}}} data - Any
   *   data you wish to associate with the wish.
   *   Genie adds a 'timesMade' property with total and magicWords
   *   properties to keep track of how often a wish is made with a
   *   given magicWord.
   * @property {[]} magicWords - Used to match this wish on genie.getMatchingWishes
   * @property {Function} action - The action to be performed when genie.makeWish is
   *    called with this wish.
   */

  /**
   * A path context
   * @typedef {Object} PathContext
   * @property {RegExp[]} regexes
   * @property {string[]} paths
   * @property {string[]} contexts
   */

  /**
   * Creates and registers a new wish with the given pseudo wish(es).
   * @param {{}|{}[]} wish - pseudo wish(es)
   * @returns {wish|wish[]} The registered wish or array of wishes.
   */
  function registerWish(wish) {
    if (_isArray(wish)) {
      var wishesRegistered = [];
      _each(wish, function(w) {
        wishesRegistered.push(registerWish(w));
      });
      return wishesRegistered;
    } else {
      var newWish = _createWish(wish);
      var existingWishIndex = _getWishIndexById(newWish.id);
      if (existingWishIndex < 0) {
        _wishes.push(newWish);
      } else {
        _wishes[existingWishIndex] = newWish;
      }

      return newWish;
    }
  }

  /**
   * Creates a new wish object.
   * @param {{}} wish
   * @returns {wish} - New wish object
   * @private
   */
  function _createWish(wish) {
    var id = wish.id || 'g-' + _previousId++;
    var newWish = {
      id: id,
      context: _createContext(wish.context),
      data: wish.data || {},
      magicWords: _arrayify(wish.magicWords),
      action: _createAction(wish.action)
    };
    newWish.data.timesMade = {
      total: 0,
      magicWords: {}
    };
    return newWish;
  }

  /**
   * Transforms the given context to a context object.
   * @param {*} context
   * @returns {context}
   * @private
   */
  function _createContext(context) {
    var newContext = context || _defaultContext;
    if (_isString(newContext) || _isArray(newContext)) {
      newContext = {
        any: _arrayify(newContext)
      };
    } else {
      newContext = _arrayizeContext(context);
    }
    return newContext;
  }

  function _arrayizeContext(context) {
    function checkAndAdd(type) {
      if (context[type]) {
        context[type] = _arrayify(context[type]);
      }
    }
    checkAndAdd('all');
    checkAndAdd('any');
    checkAndAdd('none');
    return context;
  }

  /**
   * Transforms the given action into an action
   * callback.
   * @param {Function|{}|string} action
   * @returns {Function}
   * @private
   */
  function _createAction(action) {
    if (_isString(action)) {
      action = {
        destination: action
      };
    }
    if (_isObject(action)) {
      action = (function() {
        var openNewTab = action.openNewTab;
        var destination = action.destination;
        return function() {
          if (openNewTab) {
            window.open(destination, '_blank');
          } else {
            window.location.href = destination;
          }
        };
      })();
    }

    return action;
  }

  /**
   * Deregisters the given wish. Removes it from the registry
   *   and from the _enteredMagicWords map.
   * This will delete an _enteredMagicWords listing if this
   *   is the only wish in the list.
   * @param {{}|string} wish
   * @returns {*}
   */
  function deregisterWish(wish) {
    var indexOfWish = _wishes.indexOf(wish);
    if (!indexOfWish) {
      _each(_wishes, function(aWish, index) {
        // the given parameter could be an id.
        if (wish === aWish.id || wish.id === aWish.id) {
          indexOfWish = index;
          wish = aWish;
          return false;
        }
      });
    }

    _wishes.splice(indexOfWish, 1);
    _removeWishIdFromEnteredMagicWords(wish.id);
    return wish;
  }

  function _removeWishIdFromEnteredMagicWords(id) {
    function removeIdFromWishes(charObj, parent, charObjName) {
      _each(charObj, function(childProp, propName) {
        if (propName === 'wishes') {
          var index = childProp.indexOf(id);
          if (index !== -1) {
            childProp.splice(index, 1);
          }
          if (!childProp.length) {
            delete charObj[propName];
          }
        } else {
          removeIdFromWishes(childProp, charObj, propName);
        }
      });
      var keepCharObj = _getPropFromPosterity(charObj, 'wishes').length > 0;
      if (!keepCharObj && parent && charObjName) {
        delete parent[charObjName];
      }
    }
    removeIdFromWishes(_enteredMagicWords);
  }

  /**
   * Convenience method which calls getWishesWithContext and passes the arguments
   *   which are passed to this function. Then deregisters each of these.
   * @param {string|string[]|{}} context
   * @param {string|string[]} type
   * @param {string|string[]} wishContextType
   * @returns {{}[]} the deregistered wishes.
   */
  function deregisterWishesWithContext(context, type, wishContextType) {
    var deregisteredWishes = getWishesWithContext(context, type, wishContextType);
    _each(deregisteredWishes, function(wish, i) {
      deregisteredWishes[i] = deregisterWish(wish);
    });
    return deregisteredWishes;
  }

  /**
   * Get wishes in a specific context. If no context
   *   is provided, all wishes are returned.
   *   Think of this as, if genie were in the given
   *   context, what would be returned if I called
   *   genie.getMatchingWishes()?
   * @param {string|string[]} context
   * @returns {{}[]}
   */
  function getWishesInContext(context) {
    context = context || _defaultContext;
    var wishesInContext = [];
    _each(_wishes, function(wish) {
      if (_contextIsDefault(context) ||
        _contextIsDefault(wish.context) ||
        _wishInThisContext(wish, context)) {
        wishesInContext.push(wish);
      }
    });
    return wishesInContext;
  }

  /**
   * Get wishes which have {type} of {context} in their context.{wishContextType}
   * @param {string|string[]} context
   * @param {string} type
   * @param {string|string[]} wishContextTypes
   * @returns {{}[]}
   */
  function getWishesWithContext(context, type, wishContextTypes) {
    var wishesWithContext = [];
    type = type || 'any';
    _each(_wishes, function(wish) {
      var wishContext = _getWishContext(wish, wishContextTypes);

      if (!_isEmpty(wishContext) &&
        ((type === 'all' && _arrayContainsAll(wishContext, context)) ||
          (type === 'none' && _arrayContainsNone(wishContext, context)) ||
          (type === 'any' && _arrayContainsAny(wishContext, context)))) {
        wishesWithContext.push(wish);
      }
    });
    return wishesWithContext;
  }

  /**
   * Gets the wish context based on the wishContextTypes.
   * @param {{}} wish
   * @param {string|string[]} wishContextTypes
   * @returns {string[]}
   * @private
   */
  function _getWishContext(wish, wishContextTypes) {
    var wishContext = [];
    wishContextTypes = wishContextTypes || ['all', 'any', 'none'];

    wishContextTypes = _arrayify(wishContextTypes);
    _each(wishContextTypes, function(wishContextType) {
      if (wish.context[wishContextType]) {
        wishContext = wishContext.concat(wish.context[wishContextType]);
      }
    });

    return wishContext;
  }

  /**
   * Get a specific wish by an id.
   * If the id is an array, returns an array
   *   of wishes with the same order as the
   *   given array.
   * Note: If the id does not correspond to
   *   a registered wish, it will be undefined
   * @param {string|string[]} id
   * @returns {{}|{}[]|null}
   */
  function getWish(id) {
    if (_isArray(id)) {
      var wishes = [];
      _each(_getWishIndexById(id), function(index) {
        wishes.push(_wishes[index]);
      });
      return wishes;
    } else {
      var index = _getWishIndexById(id);
      if (index > -1) {
        return _wishes[index];
      } else {
        return null;
      }
    }
  }

  /**
   * Gets a wish from the _wishes array by its ID
   * @param {string|string[]} id
   * @returns {{}|{}[]}
   * @private
   */
  function _getWishIndexById(id) {
    var wishIndex = -1;
    if (_isArray(id)) {
      var wishIndexes = [];
      _each(id, function(wishId) {
        wishIndexes.push(_getWishIndexById(wishId));
      });
      return wishIndexes;
    } else {
      _each(_wishes, function(aWish, index) {
        if (aWish.id === id) {
          wishIndex = index;
          return false;
        }
      });
      return wishIndex;
    }
  }

  /**
   * Sets genie's options to the default options
   * @returns {{}}
   */
  function reset() {
    var oldOptions = options();
    options({
      wishes: [],
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
    magicWord = (_isNullOrUndefined(magicWord) ? '' : '' + magicWord).toLowerCase();
    var allWishIds = _getWishIdsInEnteredMagicWords(magicWord);
    var allWishes = getWish(allWishIds);
    var matchingWishes = _filterInContextWishes(allWishes);

    var otherMatchingWishIds = _sortWishesByMatchingPriority(_wishes, allWishIds, magicWord);
    var otherWishes = getWish(otherMatchingWishIds);
    return matchingWishes.concat(otherWishes);
  }

  function _getWishIdsInEnteredMagicWords(word) {
    var startingCharWishesObj = _climbDownChain(_enteredMagicWords, word.split(''));
    if (startingCharWishesObj) {
      return _getPropFromPosterity(startingCharWishesObj, 'wishes', true);
    } else {
      return [];
    }
  }

  function _filterInContextWishes(wishes) {
    var inContextWishes = [];
    _each(wishes, function(wish) {
      if (wish && _wishInContext(wish)) {
        inContextWishes.push(wish);
      }
    });
    return inContextWishes;
  }

  function _climbDownChain(obj, props) {
    var finalObj = obj;
    props = _arrayify(props);
    var madeItAllTheWay = _each(props, function(prop) {
      if (finalObj.hasOwnProperty(prop)) {
        finalObj = finalObj[prop];
        return true;
      } else {
        return false;
      }
    });
    if (madeItAllTheWay) {
      return finalObj;
    } else {
      return null;
    }
  }

  function _getPropFromPosterity(objToStartWith, prop, unique) {
    var values = [];
    function loadValues(obj) {
      if (obj[prop]) {
        var propsToAdd = _arrayify(obj[prop]);
        _each(propsToAdd, function(propToAdd) {
          if (!unique || !_contains(values, propToAdd)) {
            values.push(propToAdd);
          }
        });
      }
      _each(obj, function(oProp, oPropName) {
        if (oPropName !== prop) {
          values = values.concat(loadValues(oProp));
        }
      });
    }
    loadValues(objToStartWith);
    return values;
  }

  function _sortWishesByMatchingPriority(wishes, currentMatchingWishIds, givenMagicWord) {
    var matchPriorityArrays = [];
    var returnedIds = [];

    _each(wishes, function(wish) {
      if (_wishInContext(wish)) {
        var matchPriority = _bestMagicWordsMatch(wish.magicWords, givenMagicWord);
        _maybeAddWishToMatchPriorityArray(wish, matchPriority, matchPriorityArrays, currentMatchingWishIds);
      }
    }, true);

    _each(matchPriorityArrays, function(matchTypeArray) {
      if (matchTypeArray) {
        _each(matchTypeArray, function(magicWordIndexArray) {
          if (magicWordIndexArray) {
            returnedIds = returnedIds.concat(magicWordIndexArray);
          }
        });
      }
    }, true);
    return returnedIds;
  }

  function _bestMagicWordsMatch(wishesMagicWords, givenMagicWord) {
    var bestMatch = {
      matchType: _matchRankMap.noMatch,
      magicWordIndex: -1
    };
    _each(wishesMagicWords, function(wishesMagicWord, index) {
      var matchRank = _stringsMatch(wishesMagicWord, givenMagicWord);
      if (matchRank > bestMatch.matchType) {
        bestMatch.matchType = matchRank;
        bestMatch.magicWordIndex = index;
      }
      return bestMatch.matchType !== _matchRankMap.equals;
    });
    return bestMatch;
  }

  /**
   * Gives a _matchRankMap score based on
   * how well the two strings match.
   * @param {string} magicWord
   * @param {string} givenMagicWord
   * @returns {*}
   * @private
   */
  function _stringsMatch(magicWord, givenMagicWord) {
    /* jshint maxcomplexity:8 */
    magicWord = ('' + magicWord).toLowerCase();

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

  /**
   * Generates an acronym for a string.
   *
   * @param {string} string
   * @returns {string}
   * @private
   * @examples
   * _getAcronym('i love candy') // => 'ilc'
   */
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

    function _findMatchingCharacter(matchChar, string) {
      var found = false;
      for (var j = charNumber; j < string.length; j++) {
        var stringChar = string[j];
        if (stringChar === matchChar) {
          found = true;
          charNumber = j + 1;
          break;
        }
      }
      return found;
    }

    for (var i = 0; i < givenMagicWord.length; i++) {
      var matchChar = givenMagicWord[i];
      var found = _findMatchingCharacter(matchChar, magicWord);
      if (!found) {
        return _matchRankMap.noMatch;
      }
    }
    return _matchRankMap.matches;
  }

  function _maybeAddWishToMatchPriorityArray(wish, matchPriority, matchPriorityArrays, currentMatchingWishIds) {
    var indexOfWishInCurrent = currentMatchingWishIds.indexOf(wish.id);
    if (matchPriority.matchType !== _matchRankMap.noMatch) {
      if (indexOfWishInCurrent === -1) {
        _getMatchPriorityArray(matchPriorityArrays, matchPriority).push(wish.id);
      }
    } else if (indexOfWishInCurrent !== -1) {
      // remove current matching wishIds if it doesn't match
      currentMatchingWishIds.splice(indexOfWishInCurrent, 1);
    }
  }

  function _getMatchPriorityArray(arry, matchPriority) {
    arry[matchPriority.matchType] = arry[matchPriority.matchType] || [];
    var matchTypeArray = arry[matchPriority.matchType];
    var matchPriorityArray = matchTypeArray[matchPriority.magicWordIndex] = matchTypeArray[matchPriority.magicWordIndex] || [];
    return matchPriorityArray;
  }

  /**
   * Take the given wish/wish id and call it's action
   *   method if it is in context.
   * @param {*} wish - object or id or null
   * @param {string} magicWord
   * @returns {*}
   */
  function makeWish(wish, magicWord) {
    wish = _convertToWishObjectFromNullOrId(wish, magicWord);

    if (!_wishCanBeMade(wish)) {
      return null;
    }

    _executeWish(wish, magicWord);

    if (!_isNullOrUndefined(magicWord)) {
      _updateEnteredMagicWords(wish, magicWord);
    }
    return wish;
  }

  /**
   * Convert the given wish argument to a valid wish object.
   *   It could be an ID, or null. If it's null, use the
   *   magic word and assign it to be the first result from
   *   the magic word.
   * @param {*} wish - object or id
   * @param {string} magicWord
   * @returns {*}
   * @private
   */
  function _convertToWishObjectFromNullOrId(wish, magicWord) {
    var wishObject = wish;
    // Check if it may be a wish object
    if (!_isObject(wishObject)) {
      wishObject = getWish(wish);
    }
    if (_isNullOrUndefined(wishObject)) {
      var matchingWishes = getMatchingWishes(magicWord);
      if (matchingWishes.length > 0) {
        wishObject = matchingWishes[0];
      }
    }
    return wishObject;
  }

  /** A wish is non-executable if it
   *   - doesn't exist
   *   - doesn't have an action
   *   - wish is not in context
   */
  function _wishCanBeMade(wish) {
    return wish && !_isNullOrUndefined(wish.action) && _wishInContext(wish);
  }

  /**
   * Calls the wish's action with the wish and
   *   magic word as the parameters and iterates
   *   the timesMade properties.
   *
   * @param {*} wish
   * @param {string} magicWord
   * @private
   */
  function _executeWish(wish, magicWord) {
    wish.action(wish, magicWord);
    var timesMade = wish.data.timesMade;
    timesMade.total++;
    timesMade.magicWords[magicWord] = timesMade.magicWords[magicWord] || 0;
    timesMade.magicWords[magicWord]++;
  }

  /**
   * Returns true if the given context is the default context.
   * @param {string|string[]} context
   * @returns {boolean}
   * @private
   */
  function _contextIsDefault(context) {
    if (!_isObject(context)) {
      context = _arrayify(context);
    }
    if (_isArray(context) && context.length === 1) {
      return context[0] === _defaultContext[0];
    } else if (context.any && context.any.length === 1) {
      return context.any[0] === _defaultContext[0];
    } else {
      return false;
    }
  }

  /**
   * There are a few ways for a wish to be in context:
   *  1. Genie's context is equal to the default context
   *  2. The wish's context is equal to the default context
   *  3. The wish's context is equal to genie's context
   *  4. The wish is _wishInThisContext(_context)
   * @param {*} wish
   * @returns {*}
   * @private
   */
  function _wishInContext(wish) {
    return _contextIsDefault(_context) ||
      _contextIsDefault(wish.context) ||
      wish.context === _context ||
      _wishInThisContext(wish, _context);
  }

  /**
   * This will get the any, all, and none constraints for the
   *   wish's context. If a constraint is not present, it is
   *   considered passing. The exception being if the wish has
   *   no context (each context property is not present). In
   *   this case, it is not in context.
   * These things must be true for the wish to be in the given context:
   *  1. any: genie's context contains any of these.
   *  2. all: genie's context contains all of these.
   *  3. none: genie's context contains none of these.
   *
   * @param {{}} wish
   * @param {string|string[]} theContexts
   * @returns {boolean}
   * @private
   */
  function _wishInThisContext(wish, theContexts) {
    /* jshint maxcomplexity:5 */
    var wishContextConstraintsMet;

    var any = wish.context.any || [];
    var all = wish.context.all || [];
    var none = wish.context.none || [];

    var containsAny = _isEmpty(any) || _arrayContainsAny(theContexts, any);
    var containsAll = theContexts.length >= all.length && _arrayContainsAll(theContexts, all);
    var wishNoneContextNotContainedInContext = _arrayContainsNone(theContexts, none);

    wishContextConstraintsMet = containsAny && containsAll && wishNoneContextNotContainedInContext;

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
   * @param {*} wish
   * @param {string} magicWord
   * @private
   */
  function _updateEnteredMagicWords(wish, magicWord) {
    // Reset entered magicWords order.
    var spotForWishes = _createSpotInEnteredMagicWords(_enteredMagicWords, magicWord);
    spotForWishes.wishes = spotForWishes.wishes || [];
    var existingIndex = spotForWishes.wishes.indexOf(wish.id);
    if (existingIndex !== 0) {
      _repositionWishIdInEnteredMagicWordsArray(wish.id, spotForWishes.wishes, existingIndex);
    }
  }

  function _createSpotInEnteredMagicWords(spot, chars) {
    var firstChar = chars.substring(0, 1);
    var remainingChars = chars.substring(1);
    var nextSpot = spot[firstChar] = spot[firstChar] || {};
    if (remainingChars) {
      return _createSpotInEnteredMagicWords(nextSpot, remainingChars);
    } else {
      return nextSpot;
    }
  }

  function _repositionWishIdInEnteredMagicWordsArray(id, arry, existingIndex) {
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

  /**
   * Gets the context paths that should be added based on the
   *   given path and the context paths that should be removed
   *   based ont he given path
   * @param {string} path
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
      var contexts = pathContext.contexts;
      var regexes = pathContext.regexes;
      var paths = pathContext.paths;

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
   * @param {*} obj
   * @returns {[*]}
   * @private
   * @examples
   * _arrayify('hello') // => ['hello']
   * _arrayify() // => []
   * _arrayify(['you', 'rock']) // => ['you', 'rock']
   * _arrayify({x: 3, y: 'sup'}) // => [{x: 3, y: 'sup'}]
   */
  function _arrayify(obj) {
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
   * @param {[]} arry
   * @param {*|[*]} obj
   * @returns {[]} arry
   * @private
   * @examples
   * _addUniqueItems(1, 2) // => [1,2]
   * _addUniqueItems(1, [2,3]) // => [1,2,3]
   * _addUniqueItems([1,2], 3) // => [1,2,3]
   * _addUniqueItems([1,2], [3,4]) // => [1,2,3,4]
   * _addUniqueItems([1,2], [3,1]) // => [1,2,3]
   * _addUniqueItems([1,2], [1,2]) // => [1,2]
   * _addUniqueItems([1,2], [1,2]) // => [1,2]
   * _addUniqueItems([1,2,3], [1,2,1,2,3]) // => [1,2,3]
   */
  function _addUniqueItems(arry, obj) {
    obj = _arrayify(obj);
    arry = _arrayify(arry);
    _each(obj, function(o) {
      if (arry.indexOf(o) < 0) {
        arry.push(o);
      }
    });
    return arry;
  }

  /**
   * Removes all instances of items in the given obj
   *   from the given arry.
   * @param {[]} arry
   * @param {*|[*]} obj
   * @returns {[]} arry
   * @private
   * @examples
   * _removeItems(1, 2) // => [1]
   * _removeItems(1, [2,3]) // => [1]
   * _removeItems([1,2], 3) // => [1,2]
   * _removeItems([1,2], [3,4]) // => [1,2]
   * _removeItems([1,2], [3,1]) // => [2]
   * _removeItems([1,2], [1,2]) // => []
   * _removeItems([1,2,1,2,3], [2,3]) // => [1,1]
   */
  function _removeItems(arry, obj) {
    arry = _arrayify(arry);
    obj = _arrayify(obj);
    var i = 0;

    while(i < arry.length) {
      if (_contains(obj, arry[i])) {
        arry.splice(i, 1);
      } else {
        i++;
      }
    }
    return arry;
  }

  /**
   * Returns true if arry1 contains any of arry2's elements
   * @param {*|[*]} arry1
   * @param {*|[*]} arry2
   * @returns {boolean}
   * @private
   * @examples
   * _arrayContainsAny(1, 2) // => false
   * _arrayContainsAny([1], 2) // => false
   * _arrayContainsAny(1, [2]) // => false
   * _arrayContainsAny([2], [2]) // => true
   * _arrayContainsAny([1,2], [2]) // => true
   */
  function _arrayContainsAny(arry1, arry2) {
    arry1 = _arrayify(arry1);
    arry2 = _arrayify(arry2);
    for (var i = 0; i < arry2.length; i++) {
      if (_contains(arry1, arry2[i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns true if arry1 does not contain any of arry2's elements
   * @param {*|[*]} arry1
   * @param {*|[*]} arry2
   * @returns {boolean}
   * @private
   */
  function _arrayContainsNone(arry1, arry2) {
    arry1 = _arrayify(arry1);
    arry2 = _arrayify(arry2);
    for (var i = 0; i < arry2.length; i++) {
      if (_contains(arry1, arry2[i])) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns true if arry1 contains all of arry2's elements
   * @param {*|[*]} arry1
   * @param {*|[*]} arry2
   * @returns {boolean}
   * @private
   */
  function _arrayContainsAll(arry1, arry2) {
    arry1 = _arrayify(arry1);
    arry2 = _arrayify(arry2);
    for (var i = 0; i < arry2.length; i++) {
      if (!_contains(arry1, arry2[i])) {
        return false;
      }
    }
    return true;
  }

  /**
   * Whether an object has an index in an array
   * @param {[]} arry
   * @param {*} obj
   * @returns {boolean}
   * @private
   */
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
   * @param {*|[*]} obj
   * @param {Function} fn
   * @private
   * @examples
   * _each({a: 1, b: 'hello'}, callback) // => calls callback 2 times
   */
  function _each(obj, fn, reverse) {
    if (_isPrimitive(obj)) {
      obj = _arrayify(obj);
    }
    if (_isArray(obj)) {
      return _eachArray(obj, fn, reverse);
    } else {
      return _eachProperty(obj, fn);
    }
  }

  /**
   * If reverse is true, calls _eachArrayReverse(arry, fn)
   *   otherwise calls _eachArrayForward(arry, fn)
   * @param {[*]} arry
   * @param {Function} fn
   * @param {boolean} reverse
   * @returns {boolean}
   * @private
   */
  function _eachArray(arry, fn, reverse) {
    if (_isTrue(reverse)) {
      return _eachArrayReverse(arry, fn);
    } else {
      return _eachArrayForward(arry, fn);
    }
  }

  /**
   * Iterates through the array and calls the given function
   *   in reverse order.
   * @param {[*]} arry
   * @param {Function} fn
   * @returns {boolean} whether the loop broke early
   * @private
   */
  function _eachArrayReverse(arry, fn) {
    var ret = true;
    for (var i = arry.length - 1; i >= 0; i--) {
      ret = fn(arry[i], i, arry);
      if (_isFalse(ret)) {
        break;
      }
    }
    return ret;
  }

  /**
   * Iterates through the array and calls the given function
   * @param {[*]} arry
   * @param {Function} fn
   * @returns {boolean} whether the loop broke early
   * @private
   */
  function _eachArrayForward(arry, fn) {
    var ret = true;
    for (var i = 0; i < arry.length; i++) {
      ret = fn(arry[i], i, arry);
      if (_isFalse(ret)) {
        break;
      }
    }
    return ret;
  }

  /**
   *
   * @param {{}} obj
   * @param {Function} fn
   * @returns {boolean}
   * @private
   */
  function _eachProperty(obj, fn) {
    var ret = true;
    for (var prop in obj) {
      if (obj.hasOwnProperty(prop)) {
        ret = fn(obj[prop], prop, obj);
        if (_isFalse(ret)) {
          break;
        }
      }
    }
    return ret;
  }

  /**
   *
   * @param {*} bool
   * @returns {boolean}
   * @private
   */
  function _isTrue(bool) {
    /* jshint -W116 */
    return bool == true;
  }

  /**
   *
   * @param {*} bool
   * @returns {boolean}
   * @private
   */
  function _isFalse(bool) {
    /* jshint -W116 */
    return bool == false;
  }

  /**
   *
   * @param {*} obj
   * @returns {boolean}
   * @private
   * @examples
   * _isArray({x: 1}) // => false
   * _isArray([1]) // => true
   */
  function _isArray(obj) {
    return obj instanceof Array;
  }

  /**
   *
   * @param {*} obj
   * @returns {boolean}
   * @private
   */
  function _isString(obj) {
    return typeof obj === 'string';
  }

  /**
   *
   * @param {*} obj
   * @returns {boolean}
   * @private
   */
  function _isObject(obj) {
    return typeof obj === 'object';
  }

  /**
   *
   * @param {*} obj
   * @returns {boolean}
   * @private
   */
  function _isPrimitive(obj) {
    /* jshint maxcomplexity:5 */
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

  /**
   *
   * @param {*} obj
   * @returns {boolean}
   * @private
   */
  function _isUndefined(obj) {
    if (_isArray(obj)) {
      return !_each(obj, function(o) {
        return !_isUndefined(o);
      });
    } else {
      return typeof obj === 'undefined';
    }
  }

  /**
   *
   * @param {*} obj
   * @returns {boolean}
   * @private
   */
  function _isNull(obj) {
    if (_isArray(obj)) {
      return !_each(obj, function(o) {
        return !_isNull(o);
      });
    } else {
      return obj === null;
    }
  }

  /**
   *
   * @param {*} obj
   * @returns {boolean}
   * @private
   */
  function _isNullOrUndefined(obj) {
    return _isNull(obj) || _isUndefined(obj);
  }

  // Begin API functions. //
  /**
   * @typedef {Object} GenieOptions
   * @property {[]} wishes - All wishes registered with genie
   * @property {number} previousId - The number used to generate an
   * id for a newly registered wish
   * @property {{}} enteredMagicWords - An exploded object of letters
   * to wishes and letters.
   * @property {[]} context - an array of all of genie's current contexts
   * @property {[]} previousContext - genie's most recent context
   * @property {boolean} enabled - whether genie is enabled
   * @property {boolean} returnOnDisabled - whether genie will return an
   * empty object when it is disabled.
   */
  
  /**
   * An api into genie's options
   * The opts argument can have the properties of GenieOptions
   * as well as the following property:
   *  - noWishMerge: boolean - Using this will simply assign the
   *    given wishes to genie's _wishes variable. If falsy, then
   *    genie.mergeWishes is called with the wishes.
   *
   * @param {{}} opts
   * @returns {GenieOptions}
   */
  function options(opts) {
    /* jshint maxcomplexity:8 */
    if (opts) {
      _updateWishesWithOptions(opts);
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
      enabled: _enabled,
      returnOnDisabled: _returnOnDisabled
    };
  }

  /**
   * This will override the matching algorithm (getMatchingWishes)
   * @param fn {Function} - the new function. Should accept wishes array,
   *   magicWord string, and enteredMagicWords object.
   *   You wont need to change how you interface with
   *   getMatching wishes at all by using this.
   */
  function overrideMatchingAlgorithm(fn) {
    genie.getMatchingWishes = _passThrough(function(magicWord) {
      return fn(_wishes, magicWord, _context, _enteredMagicWords);
    }, []);
  }

  /**
   * This will set the matching algorithm back to the original
   */
  function restoreMatchingAlgorithm() {
    genie.getMatchingWishes = _originalMatchingAlgorithm;
  }

  /**
   * If wishes are present, will update them based on options given.
   * @param {{}} opts
   * @private
   */
  function _updateWishesWithOptions(opts) {
    if (opts.wishes) {
      if (opts.noWishMerge) {
        _wishes = opts.wishes;
      } else {
        mergeWishes(opts.wishes);
      }
    }
  }

  /**
   * Merges the given wishes with genie's current wishes.
   * Iterates through the wishes: If the wish does not have
   *   an action, and the wish's id is registered with genie,
   *   genie will assign the registered wish's action to
   *   the new wish's action property.
   *   Next, if the new wish has an action, it is registered
   *   with genie based on its wishId
   * @param {[]} wishes - Array of wish objects
   * @returns {[wish]}
   */
  function mergeWishes(wishes) {
    _each(wishes, function(newWish) {
      var wishIndex = -1;
      var existingWish = null;
      _each(_wishes, function(aWish, aWishIndex) {
        if (aWish.id === newWish.id) {
          existingWish = aWish;
          wishIndex = aWishIndex;
          return false;
        }
      });
      if (!newWish.action && existingWish) {
        newWish.action = existingWish.action;
      }
      if (newWish.action) {
        _wishes[wishIndex] = newWish;
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
   * @param {string|string[]} newContext
   * @returns {string[]}
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
   * @param {string|string[]} newContext
   * @returns {Array}
   */
  function addContext(newContext) {
    _previousContext = _context;
    _addUniqueItems(_context, newContext);
    return _context;
  }

  /**
   * Removes the given context
   * @param {string|string[]} contextToRemove
   * @returns {string[]}
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
   * @returns {string[]}
   */
  function revertContext() {
    return context(_previousContext);
  }

  /**
   * Changes context to _defaultContext
   * @returns {string[]}
   */
  function restoreContext() {
    return context(_defaultContext);
  }

  /**
   * Updates genie's context based on the given path
   * @param {string} path - the path to match
   * @param {boolean=} noDeregister - Do not deregister wishes
   *   which are no longer in context
   * @returns {string[]} - The new context
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
   * Add a path context to genie's pathContexts
   * @param {PathContext[]} pathContexts
   * @returns {PathContext[]} - The new path contexts
   */
  function addPathContext(pathContexts) {
    _each(pathContexts, function(pathContext) {
      if (pathContext.paths) {
        pathContext.paths = _arrayify(pathContext.paths);
      }

      if (pathContext.regexes) {
        pathContext.regexes = _arrayify(pathContext.regexes);
      }

      if (pathContext.contexts) {
        pathContext.contexts = _arrayify(pathContext.contexts);
      }
    });
    _addUniqueItems(_pathContexts, pathContexts);
    return _pathContexts;
  }

  /**
   * Removes the given path contexts from genie's path contexts
   * @param {PathContext[]} pathContext
   * @returns {PathContext[]}
   */
  function removePathContext(pathContext) {
    _removeItems(_pathContexts, pathContext);
    return _pathContexts;
  }

  /**
   * Set/get genie's enabled state
   * @param {boolean=} newState
   * @returns {boolean}
   */
  function enabled(newState) {
    if (newState !== undefined) {
      _enabled = newState;
    }
    return _enabled;
  }

  /**
   * Set/get genie's returnOnDisabled state
   * This defines whether genie will return an empty
   *   object when it is disabled. Useful for when you
   *   want to disable genie, but don't want to do
   *   null checks in your code everywhere you use genie.
   * @param {boolean=} newState
   * @returns {boolean}
   */
  function returnOnDisabled(newState) {
    if (newState !== undefined) {
      _returnOnDisabled = newState;
    }
    return _returnOnDisabled;
  }

  /**
   * Used to hijack public api functions for the
   *   enabled feature
   * @param {Function} fn
   * @param {*} emptyRetObject
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
  genie.getWishesInContext = _passThrough(getWishesInContext, []);
  genie.getWishesWithContext = _passThrough(getWishesWithContext, []);
  genie.getWish = _passThrough(getWish, {});
  genie.getMatchingWishes = _passThrough(getMatchingWishes, []);
  genie.overrideMatchingAlgorithm = _passThrough(overrideMatchingAlgorithm, {});
  genie.restoreMatchingAlgorithm = _passThrough(restoreMatchingAlgorithm, {});
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
  
  _originalMatchingAlgorithm = genie.getMatchingWishes;
  
  return genie;

}));