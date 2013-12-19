'use strict';

(function() {
  var app = angular.module('genieApp', ['uxGenie', 'ga']);

  // Makes this modular if we don't just use the global instance and use it as a module instead  
  app.constant('genie', genie);

  app.controller('GenieCtrl', function($scope, genie, ga) {

    $scope.genieVisible = false;
    
    $scope.genieStyle = {
      color: 'light',
      size: 'large',
      animationSpeed: 'fast'
    };
    $scope.wishesMade = 0;
    $scope.wishMade = function(wish) {
      $scope.wishesMade++;
      ga('send', 'event', 'wish', 'made', $scope.wishesMade);
    };

    $scope.wishMagicWords = '';
    
    $scope.exportOrImportGenie = function() {
      if ($scope.genieExportImport) {
        genie.options(JSON.parse($scope.genieExportImport));
      } else {
        $scope.genieExportImport = JSON.stringify(genie.options(), null, 2);
      }
    };

    $scope.addWishFromInput = function() {
      if ($scope.wishMagicWords) {
        ga('send', 'event', 'button', 'click', 'Create Wish: ' + $scope.wishMagicWords);
        addWish($scope.wishMagicWords);
        $scope.wishMagicWords = '';
      }
    };

    function addWish(magicWords, action) {
      if (typeof magicWords === 'string') {
        magicWords = magicWords.split(',');
      }
      return genie({
        magicWords: magicWords,
        action: action || function(wish) {
          alert('Your "' + wish.magicWords[0] + '" wish is my command!');
        }
      });
    }
    
    function addStyleWish(style, altStyle, property) {
      var originalWish, altWish;
      function applyStyleAndSwapWishes(wish) {
        $scope.genieStyle[property] = wish.data.style.toLowerCase();
        genie.deregisterWish(wish);
        genie(wish.data.otherWish);
      }
      originalWish = genie({
        magicWords: 'Style the lamp: ' + style,
        action: applyStyleAndSwapWishes,
        data: {
          style: style
        }
      });
      altWish = genie({
        magicWords: 'Style the lamp: ' + altStyle,
        action: applyStyleAndSwapWishes,
        data: {
          style: altStyle,
          otherWish: originalWish
        }
      });
      originalWish.data.otherWish = altWish;
      genie.deregisterWish(altWish);
    }
    
    function addDestinationWish(magicWord, destination) {
      addWish('Navigate: ' + magicWord, {
        destination: destination,
        openNewTab: true
      });
    }

    addDestinationWish('Genie on GitHub', 'http://www.github.com/kentcdodds/genie');
    addDestinationWish('UX-Genie on GitHub', 'http://www.github.com/kentcdodds/ux-genie');
    addDestinationWish('Genie Tests', './test');
    
    addStyleWish('Dark', 'Light', 'color');
    addStyleWish('Small', 'Large', 'size');
    addStyleWish('Slow', 'Fast', 'animationSpeed');
    
    addWish('Alert!!!');

  });

})();