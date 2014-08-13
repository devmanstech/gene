(function() {
  function prepForTest() {
    genie.reset();
    genie.restoreContext();
    genie.enabled(true);
    genie.returnOnDisabled(true);
  }

  function registerWishWithDefaults(defaults) {
    if (typeof defaults === 'string' || defaults instanceof Array) {
      defaults = {
        magicWords: defaults
      };
    }
    defaults = defaults || {};
    return genie({
      id: defaults.id,
      context: defaults.context,
      data: defaults.data || {
        called: 0
      },
      magicWords: defaults.magicWords || 'magicWords',
      action: defaults.action || function(wish) {
        wish.called++;
      }
    });
  }

  Evidence.TestCase.extend('GenieTest', {
    testResettingGenie: function(t) {
      prepForTest();
      var wish = registerWishWithDefaults();
      genie.reset();
      genie.makeWish(wish);
      t.assertEqual(wish.data.called, 0);
    },
    testMagicWords: function(t) {
      prepForTest();
      registerWishWithDefaults('Lord of the Flies');
      registerWishWithDefaults('Pirates of the Carribean');
      registerWishWithDefaults('Lord of the Rings');
      
      var ofTheWishes = genie.getMatchingWishes('of the');
      t.assertEqual(ofTheWishes.length, 3);
      
      var lordWishes = genie.getMatchingWishes('Lord of the');
      t.assertEqual(lordWishes.length, 2);
      
      var ringWishes = genie.getMatchingWishes('Ring');
      t.assertEqual(ringWishes.length, 1);
    },
    testMultipleMagicWords: function(t) {
      prepForTest();
      registerWishWithDefaults(['Book', 'Music', 'Movie']);
      registerWishWithDefaults(['Cat', 'Dog', 'Goat']);
      
      var bookWish = genie.getMatchingWishes('b');
      var mWish = genie.getMatchingWishes('m');
      var movieWish = genie.getMatchingWishes('movie');
      t.assertEqual(bookWish.length, 1);
      t.assertEqual(mWish.length, 1);
      t.assertEqual(movieWish.length, 1);
      t.assertIdentical(bookWish[0], mWish[0]);
      t.assertIdentical(mWish[0], movieWish[0]);


      var catWish = genie.getMatchingWishes('cat');
      var dWish = genie.getMatchingWishes('d');
      var tWish = genie.getMatchingWishes('t');
      t.assertEqual(catWish.length, 1);
      t.assertEqual(dWish.length, 1);
      t.assertEqual(tWish.length, 1);
      t.assertIdentical(catWish[0], dWish[0]);
      t.assertIdentical(dWish[0], tWish[0]);
      
      var oWishes = genie.getMatchingWishes('o');
      t.assertEqual(oWishes.length, 2);
      t.assertFalse(oWishes[0] === oWishes[1]);
    },
    testSimpleEnteredMagicWords: function(t) {
      prepForTest();

      var fred = registerWishWithDefaults('Fred Mertz');
      var ethel = registerWishWithDefaults('Ethel Mertz');
      var lucy = registerWishWithDefaults('Lucy Mertz');
      
      // In opposite order of their registration
      var mertzMatch = genie.getMatchingWishes('mertz');
      t.assertIdentical(mertzMatch[0], lucy);
      t.assertIdentical(mertzMatch[1], ethel);
      t.assertIdentical(mertzMatch[2], fred);
      
      // In order of called then opposite registration
      genie.makeWish(ethel, 'mertz');
      mertzMatch = genie.getMatchingWishes('mertz');
      t.assertIdentical(mertzMatch[0], ethel);
      t.assertIdentical(mertzMatch[1], lucy);
      t.assertIdentical(mertzMatch[2], fred);

      /*
       * More complicated here. A specific wish must be called
       * twice in a row for a specific magic word for it to
       * be first if that magic word already has a wish
       * associated with it. So lucy must be called with
       * 'mertz' twice in a row before she can take the
       * top spot.
       */
      genie.makeWish(lucy, 'mertz');
      mertzMatch = genie.getMatchingWishes('mertz');
      t.assertIdentical(mertzMatch[0], ethel);
      t.assertIdentical(mertzMatch[1], lucy);
      t.assertIdentical(mertzMatch[2], fred);
      
      /*
       * Lucy is now king of the hill.
       * Ethel is second, and fred isn't
       * even on the hill at all...
       */
      genie.makeWish(lucy, 'mertz');
      mertzMatch = genie.getMatchingWishes('mertz');
      t.assertIdentical(mertzMatch[0], lucy);
      t.assertIdentical(mertzMatch[1], ethel);
      t.assertIdentical(mertzMatch[2], fred);
      
      /*
       * De-registering lucy and making a
       * wish with fred will place ethel as
       * king of the hill and fred as second
       */
      genie.deregisterWish(lucy);
      genie.makeWish(fred, 'mertz');
      mertzMatch = genie.getMatchingWishes('mertz');
      t.assertEqual(mertzMatch.length, 2);
      t.assertIdentical(mertzMatch[0], ethel);
      t.assertIdentical(mertzMatch[1], fred);
    },
    testComplexMagicWords: function(t) {
      prepForTest();
      var equal = registerWishWithDefaults('tTOtc'); // equal ignoring case
      var contains = registerWishWithDefaults('The ttotc container'); // contains
      var acronym = registerWishWithDefaults('The Tail of Two Cities'); // acronym
      var matchWish = registerWishWithDefaults('The Tail of Forty Cities'); // match
      var ttotcAcronym = 'ttotc';
      
      // Even though they were registered in reverse order, the matching should follow this pattern
      var match = genie.getMatchingWishes(ttotcAcronym);
      t.assertEqual(match.length, 4);
      t.assertIdentical(match[0], equal);
      t.assertIdentical(match[1], contains);
      t.assertIdentical(match[2], acronym);
      t.assertIdentical(match[3], matchWish);
      
      // enteredMagicWords trumps acronym and equal
      genie.makeWish(matchWish, ttotcAcronym);
      match = genie.getMatchingWishes(ttotcAcronym);
      t.assertEqual(match.length, 4);
      t.assertIdentical(match[0], matchWish);
      t.assertIdentical(match[1], equal);
      t.assertIdentical(match[2], contains);
      t.assertIdentical(match[3], acronym);
    },
    testStartsWithMagicWord: function(t) {
      prepForTest();
      var magicWord = 'f';
      var noMatch = registerWishWithDefaults('Hello World');
      var contains = registerWishWithDefaults('I like life');
      var notFirstButStartsWith = registerWishWithDefaults('I like fish');
      var veryFirstStartsWith = registerWishWithDefaults('Fish like me');

      var match = genie.getMatchingWishes(magicWord);
      t.assertEqual(match.length, 3);
      t.assertIdentical(match[0], veryFirstStartsWith);
      t.assertIdentical(match[1], notFirstButStartsWith);
      t.assertIdentical(match[2], contains);
    },
    testNonStringMagicWords: function(t) {
      prepForTest();
      var num = registerWishWithDefaults([1,2,'hey3']);
      var numMatch = genie.getMatchingWishes(1);
      t.assertEqual(numMatch.length, 1);
      t.assertIdentical(numMatch[0], num);
    },
    testEnabled: function(t) {
      prepForTest();
      genie.enabled(false);
      t.assertEqual(Object.keys(genie()).length, 0);
      t.assertEqual(genie.getMatchingWishes().length, 0);
      t.assertEqual(Object.keys(genie.makeWish()).length, 0);
      t.assertEqual(Object.keys(genie.options()).length, 0);
      t.assertEqual(Object.keys(genie.deregisterWish()).length, 0);
      t.assertEqual(Object.keys(genie.reset()), 0);
      t.assertEqual(genie.context(), '');
      t.assertEqual(genie.revertContext(), '');
      t.assertEqual(genie.restoreContext(), '');
      t.assertEqual(genie.enabled(), false);
      t.assertEqual(genie.returnOnDisabled(), true);

      genie.enabled(true);
      genie.returnOnDisabled(false);
      genie.enabled(false);

      t.assertEqual(genie(), undefined);
      t.assertEqual(genie.getMatchingWishes(), undefined);
      t.assertEqual(genie.makeWish(), undefined);
      t.assertEqual(genie.options(), undefined);
      t.assertEqual(genie.deregisterWish(), undefined);
      t.assertEqual(genie.reset(), undefined);
      t.assertEqual(genie.context(), undefined);
      t.assertEqual(genie.revertContext(), undefined);
      t.assertEqual(genie.restoreContext(), undefined);
      t.assertEqual(genie.enabled(), false); // Special case. Enabled always runs.
      t.assertEqual(genie.returnOnDisabled(), undefined);
    },
    testRegistrationOfObjects: function(t) {
      var registeredWishes = genie([
        {
          magicWords: ['Zerahemla', 'Nephite City'],
          action: function(wish1Object) {
            t.assertIdentical(wish1Object, registeredWishes[0]);
          }
        },
        {
          magicWords: ['Jerusalem', 'Jewish City'],
          action: function(wish2Object) {
            t.assertIdentical(wish2Object, registeredWishes[1]);
          }
        }
      ]);
      genie.makeWish(registeredWishes[0]);
      genie.makeWish(registeredWishes[1]);
    },
    testNavigationWish: function(t) {
      prepForTest();
      var destination = window.location.href + '#success';
      var moveToSuccess = genie({
        magicWords: 'Add success hash',
        action: destination
      });
      genie.makeWish(moveToSuccess);
      t.assertEqual(window.location.href, destination);
      // Cannot really test the new tab action, but if I could, it would look like this:
      // wish = genie({
      //   magicWords: 'Open GenieJS repo',
      //   action: {
      //     destination: 'http://www.github.com/kentcdodds/genie',
      //     openNewTab: true
      //   }
      // });
      // genie.makeWish(wish);
    }
  });
})();