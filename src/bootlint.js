/*!
 * Bootlint - an HTML linter for Bootstrap projects
 * https://github.com/twbs/bootlint
 * Copyright (c) 2014 Christopher Rebert
 * Licensed under the MIT License.
 */

/*eslint-env node */

var cheerio = require('cheerio');

(function (exports) {
    'use strict';
    var NUM_COLS = 12;
    var COL_REGEX = /\bcol-(xs|sm|md|lg)-(\d{0,2})\b/;
    var COL_REGEX_G = /\bcol-(xs|sm|md|lg)-(\d{0,2})\b/g;
    var COL_CLASSES = [];
    var SCREENS = ['xs', 'sm', 'md', 'lg'];
    SCREENS.forEach(function (screen) {
        for (var n = 1; n <= NUM_COLS; n++) {
            COL_CLASSES.push('.col-' + screen + '-' + n);
        }
    });
    var SCREEN2NUM = {
        'xs': 0,
        'sm': 1,
        'md': 2,
        'lg': 3
    };
    var NUM2SCREEN = ['xs', 'sm', 'md', 'lg'];
    var IN_NODE_JS = !!(cheerio.load);

    function compareNums(a, b) {
        return a - b;
    }

    function isDoctype(node) {
        return node.type === 'directive' && node.name === '!doctype';
    }

    function filenameFromUrl(url) {
        var filename = url.replace(/[#?].*$/, ''); // strip querystring & fragment ID
        var lastSlash = filename.lastIndexOf('/');
        if (lastSlash !== -1) {
            filename = filename.slice(lastSlash + 1);
        }
        return filename;
    }

    function withoutClass(classes, klass) {
        return classes.replace(new RegExp('\\b' + klass + '\\b', 'g'), '');
    }

    function columnClassKey(colClass) {
        return SCREEN2NUM[COL_REGEX.exec(colClass)[1]];
    }

    function compareColumnClasses(a, b) {
        return columnClassKey(a) - columnClassKey(b);
    }

    /**
     * Moves any grid column classes to the end of the class string and sorts the grid classes by ascending screen size.
     * @param {string} classes The "class" attribute of a DOM node
     * @returns {string}
     */
    function sortedColumnClasses(classes) {
        // extract column classes
        var colClasses = [];
        while (true) {
            var match = COL_REGEX.exec(classes);
            if (!match) {
                break;
            }
            var colClass = match[0];
            colClasses.push(colClass);
            classes = withoutClass(classes, colClass);
        }

        colClasses.sort(compareColumnClasses);
        return classes + ' ' + colClasses.join(' ');
    }

    /**
     * @param {string} classes The "class" attribute of a DOM node
     * @returns {Object.<string, integer[]>} Object mapping grid column widths (1 thru 12) to sorted arrays of screen size numbers (see SCREEN2NUM)
     *      Widths not used in the classes will not have an entry in the object.
     */
    function width2screensFor(classes) {
        var width = null;
        var width2screens = {};
        while (true) {
            var match = COL_REGEX_G.exec(classes);
            if (!match) {
                break;
            }
            var screen = match[1];
            width = match[2];
            var screens = width2screens[width];
            if (!screens) {
                screens = width2screens[width] = [];
            }
            screens.push(SCREEN2NUM[screen]);
        }

        for (width in width2screens) {
            if (width2screens.hasOwnProperty(width)) {
                width2screens[width].sort(compareNums);
            }
        }

        return width2screens;
    }

    /**
     * Given a sorted array of integers, this finds all contiguous runs where each item is incremented by 1 from the next.
     * For example:
     *      [0, 2, 3, 5] has one such run: [2, 3]
     *      [0, 2, 3, 4, 6, 8, 9, 11] has two such runs: [2, 3, 4], [8, 9]
     *      [0, 2, 4] has no runs.
     * @param {integer[]} list Sorted array of integers
     * @returns {integer[][]} Array of pairs of start and end values of runs
     */
    function incrementingRunsFrom(list) {
        list = list.concat([Infinity]);// use Infinity to ensure any nontrivial (length >= 2) run ends before the end of the loop
        var runs = [];
        var start = null;
        var prev = null;
        for (var i = 0; i < list.length; i++) {
            var current = list[i];
            if (start === null) {
                // first element starts a trivial run
                start = current;
            }
            else if (prev + 1 !== current) {
                // run ended
                if (start !== prev) {
                    // run is nontrivial
                    runs.push([start, prev]);
                }
                // start new run
                start = current;
            }
            // else: the run continues

            prev = current;
        }
        return runs;
    }

    exports.lintDoctype = (function () {
        var MISSING_DOCTYPE = "Document is missing a DOCTYPE declaration";
        var NON_HTML5_DOCTYPE = "Document declares a non-HTML5 DOCTYPE";
        if (IN_NODE_JS) {
            return function ($) {
                var doctype = $(':root')[0];
                while (doctype && !isDoctype(doctype)) {
                    doctype = doctype.prev;
                }
                if (!doctype) {
                    return MISSING_DOCTYPE;
                }
                var doctypeId = doctype.data.toLowerCase();
                if (doctypeId !== '!doctype html' && doctypeId !== '!doctype html system "about:legacy-compat"') {
                    return NON_HTML5_DOCTYPE;
                }
            };
        }
        else {
            return function () {
                /*eslint-disable no-undef */
                var doc = window.document;
                /*eslint-enable un-undef */
                if (doc.doctype === null) {
                    return MISSING_DOCTYPE;
                }
                if (doc.doctype.publicId) {
                    return NON_HTML5_DOCTYPE;
                }
                if (doc.doctype.systemId && doc.doctype.systemId !== "about:legacy-compat") {
                    return NON_HTML5_DOCTYPE;
                }
            };
        }
    })();
    exports.lintMetaCharsetUtf8 = function ($) {
        var meta = $('head>meta[charset]');
        var charset = meta.attr('charset');
        if (!charset) {
            return '<head> is missing UTF-8 charset <meta> tag';
        }
        if (charset.toLowerCase() !== "utf-8") {
            return 'charset <meta> tag is specifying a legacy, non-UTF-8 charset';
        }
    };
    exports.lintXUaCompatible = function ($) {
        var meta = $('head>meta[http-equiv="X-UA-Compatible"][content="IE=edge"]');
        if (!meta.length) {
            return "<head> is missing X-UA-Compatible <meta> tag that disables old IE compatibility modes";
        }
    };
    exports.lintViewport = function ($) {
        var meta = $('head>meta[name="viewport"][content]');
        if (!meta.length) {
            return "<head> is missing viewport <meta> tag that enables responsiveness";
        }
    };
    exports.lintBootstrapv2 = function ($) {
        var columnClasses = [];
        for (var n = 1; n <= 12; n++) {
            columnClasses.push('.span' + n);
        }
        var selector = columnClasses.join(',');
        var spanNs = $(selector);
        if (spanNs.length) {
            return "Found one or more uses of outdated Bootstrap v2 `.spanN` grid classes";
        }
    };
    exports.lintContainers = function ($) {
        var notAnyColClass = COL_CLASSES.map(function (colClass) {
            return ':not(' + colClass + ')';
        }).join('');
        var selector = '*' + notAnyColClass + '>.row';
        var rowsOutsideColumns = $(selector);
        var rowsOutsideColumnsAndContainers = rowsOutsideColumns.filter(function () {
            var parent = $(this).parent();
            while (parent.length) {
                if (parent.is('.container, .container-fluid')) {
                    return false;
                }
                parent = $(parent).parent();
            }
            return true;
        });
        if (rowsOutsideColumnsAndContainers.length) {
            return "Found one or more `.row`s that were not children of a grid column or descendants of a `.container` or `.container-fluid`";
        }
    };
    exports.lintNestedContainers = function ($) {
        var nestedContainers = $('.container, .container-fluid').children('.container, .container-fluid');
        if (nestedContainers.length) {
            return "Containers (`.container` and `.container-fluid`) are not nestable";
        }
    };
    exports.lintRowAndColOnSameElem = function ($) {
        var selector = COL_CLASSES.map(function (col) {
            return ".row" + col;
        }).join(',');

        var rowCols = $(selector);
        if (rowCols.length) {
            return "Found both `.row` and `.col-*-*` used on the same element";
        }
    };
    exports.lintRemoteModals = function ($) {
        var remoteModalTriggers = $('[data-toggle="modal"][data-remote]');
        if (remoteModalTriggers.length) {
            return "Found one or more modals using the deprecated `remote` option";
        }
    };
    exports.lintJquery = function ($) {
        var theWindow = null;
        try {
            /*eslint-disable no-undef */
            theWindow = window;
            /*eslint-enable no-undef */
        }
        catch (e) {
            // deliberately do nothing
        }
        if (theWindow && (theWindow.$ || theWindow.jQuery)) {
            return undefined;
        }
        var jqueries = $('script[src*="jquery"],script[src*="jQuery"]');
        if (!jqueries.length) {
            return "Unable to locate jQuery, which is required for Bootstrap's JavaScript plugins to work";
        }
    };
    exports.lintInputGroupFormControlTypes = function ($) {
        var errs = [];
        var selectInputGroups = $('.input-group select');
        if (selectInputGroups.length) {
            errs.push("`.input-group` contains a <select>; this should be avoided as <select>s cannot be fully styled in WebKit browsers");
        }
        var textareaInputGroups = $('.input-group textarea');
        if (textareaInputGroups.length) {
            errs.push("`.input-group` contains a <textarea>; only text-based <input>s are permitted in an `.input-group`");
        }
        return errs;
    };
    exports.lintBootstrapJs = function ($) {
        var longhands = $('script[src*="bootstrap.js"]').filter(function (i, script) {
            var url = $(script).attr('src');
            var filename = filenameFromUrl(url);
            return filename === "bootstrap.js";
        });
        if (!longhands.length) {
            return undefined;
        }
        var minifieds = $('script[src*="bootstrap.min.js"]').filter(function (i, script) {
            var url = $(script).attr('src');
            var filename = filenameFromUrl(url);
            return filename === "bootstrap.min.js";
        });
        if (!minifieds.length) {
            return undefined;
        }

        return "Only one copy of Bootstrap's JS should be included; currently the webpage includes both bootstrap.js and bootstrap.min.js";
    };
    exports.lintTooltipsOnDisabledElems = function ($) {
        var selector = [
            '[disabled][data-toggle="tooltip"]',
            '.disabled[data-toggle="tooltip"]',
            '[disabled][data-toggle="popover"]',
            '.disabled[data-toggle="popover"]'
        ].join(',');
        var disabledWithTooltips = $(selector);
        if (disabledWithTooltips.length) {
            return "Tooltips and popovers on disabled elements cannot be triggered by user interaction unless the element becomes enabled." +
                " To have tooltips and popovers be triggerable by the user even when their associated element is disabled," +
                " put the disabled element inside a wrapper <div> and apply the tooltip or popover to the wrapper <div> instead.";
        }
    };
    exports.lintTooltipsInBtnGroups = function ($) {
        var nonBodyContainers = $('.btn-group [data-toggle="tooltip"]:not([data-container="body"]), .btn-group [data-toggle="popover"]:not([data-container="body"])');
        if (nonBodyContainers.length) {
            return "Tooltips and popovers within button groups should have their `container` set to 'body'. Found tooltips/popovers that might lack this setting.";
        }
    };
    exports.lintMissingInputGroupSizes = function ($) {
        var selector = [
            '.input-group:not(.input-group-lg) .btn-lg',
            '.input-group:not(.input-group-lg) .input-lg',
            '.input-group:not(.input-group-sm) .btn-sm',
            '.input-group:not(.input-group-sm) .input-sm'
        ].join(',');
        var badInputGroupSizing = $(selector);
        if (badInputGroupSizing.length) {
            return "Button and input sizing within `.input-group`s can cause issues. Instead, use input group sizing classes `.input-group-lg` or `.input-group-sm`";
        }
    };
    exports.lintMultipleFormControlsInInputGroup = function ($) {
        var badInputGroups = $('.input-group').filter(function (i, inputGroup) {
            return $(inputGroup).find('.form-control').length > 1;
        });
        if (badInputGroups.length) {
            return "Input groups cannot contain multiple `.form-control`s";
        }
    };
    exports.lintFormGroupMixedWithInputGroup = function ($) {
        var badMixes = $('.input-group.form-group');
        if (badMixes.length) {
            return ".input-group and .form-group cannot be used directly on the same element. Instead, nest the .input-group within the .form-group";
        }
    };
    exports.lintGridClassMixedWithInputGroup = function ($) {
        var selector = COL_CLASSES.map(function (colClass) {
            return '.input-group' + colClass;
        }).join(',');

        var badMixes = $(selector);
        if (badMixes.length) {
            return ".input-group and .col-*-* cannot be used directly on the same element. Instead, nest the .input-group within the .col-*-*";
        }
    };
    exports.lintRowChildrenAreCols = function ($) {
        var ALLOWED_CHILD_CLASSES = COL_CLASSES.concat(['.clearfix', '.bs-customizer-input']);
        var selector = '.row>*' + ALLOWED_CHILD_CLASSES.map(function (colClass) {
            return ':not(' + colClass + ')';
        }).join('');

        var nonColRowChildren = $(selector);
        if (nonColRowChildren.length) {
            return "Only columns (.col-*-*) may be children of `.row`s";
        }
    };
    exports.lintColParentsAreRowsOrFormGroups = function ($) {
        var selector = COL_CLASSES.map(function (colClass) {
            return '*:not(.row):not(.form-group)>' + colClass + ':not(col):not(th):not(td)';
        }).join(',');

        var colsOutsideRowsAndFormGroups = $(selector);
        if (colsOutsideRowsAndFormGroups.length) {
            return "Columns (.col-*-*) can only be children of `.row`s or `.form-group`s";
        }
    };
    exports.lintInputGroupsWithMultipleAddOnsPerSide = function ($) {
        var addOnClasses = ['.input-group-addon', '.input-group-btn'];
        var combos = [];
        addOnClasses.forEach(function (first) {
            addOnClasses.forEach(function (second) {
                combos.push('.input-group>' + first + '+' + second);
            });
        });
        var selector = combos.join(',');
        var multipleAddOns = $(selector);
        if (multipleAddOns.length) {
            return "Having multiple add-ons on a single side of an input group is not supported";
        }
    };
    exports.lintBtnToggle = function ($) {
        var badBtnToggle = $('.btn.dropdown-toggle ~ .btn');
        if (badBtnToggle.length) {
            return "`.btn.dropdown-toggle` must be the last button in a button group.";
        }
    };
    exports.lintBtnType = function ($) {
        var badBtnType = $('button:not([type="submit"], [type="reset"], [type="button"])');
        if (badBtnType.length) {
            return "Always set a `type` on `<button>`s.";
        }
    };
    exports.lintBlockCheckboxes = function ($) {
        var badCheckboxes = $('.checkbox').filter(function (i, div) {
            return $(div).filter(':has(>label>input[type="checkbox"])').length <= 0;
        });
        if (badCheckboxes.length) {
            return 'Incorrect markup used with the `.checkbox` class. The correct markup structure is .checkbox>label>input[type="checkbox"]';
        }
    };
    exports.lintBlockRadios = function ($) {
        var badRadios = $('.radio').filter(function (i, div) {
            return $(div).filter(':has(>label>input[type="radio"])').length <= 0;
        });
        if (badRadios.length) {
            return 'Incorrect markup used with the `.radio` class. The correct markup structure is .radio>label>input[type="radio"]';
        }
    };
    exports.lintInlineCheckboxes = function ($) {
        var errs = [];
        var wrongElems = $('.checkbox-inline:not(label)');
        if (wrongElems.length) {
            errs.push(".checkbox-inline should only be used on <label> elements");
        }
        var badStructures = $('.checkbox-inline').filter(function (i, label) {
            return $(label).children('input[type="checkbox"]').length <= 0;
        });
        if (badStructures.length) {
            errs.push('Incorrect markup used with the `.checkbox-inline` class. The correct markup structure is label.checkbox-inline>input[type="checkbox"]');
        }
        return errs;
    };
    exports.lintInlineRadios = function ($) {
        var errs = [];
        var wrongElems = $('.radio-inline:not(label)');
        if (wrongElems.length) {
            errs.push(".radio-inline should only be used on <label> elements");
        }
        var badStructures = $('.radio-inline').filter(function (i, label) {
            return $(label).children('input[type="radio"]').length <= 0;
        });
        if (badStructures.length) {
            errs.push('Incorrect markup used with the `.radio-inline` class. The correct markup structure is label.radio-inline>input[type="radio"]');
        }
        return errs;
    };
    exports.lintButtonsCheckedActive = function ($) {
        var selector = [
            '[data-toggle="buttons"]>label:not(.active)>input[type="checkbox"][checked]',
            '[data-toggle="buttons"]>label.active>input[type="checkbox"]:not([checked])',
            '[data-toggle="buttons"]>label:not(.active)>input[type="radio"][checked]',
            '[data-toggle="buttons"]>label.active>input[type="radio"]:not([checked])'
        ].join(',');
        var mismatchedButtonInputs = $(selector);
        if (mismatchedButtonInputs.length) {
            return ".active class used without the `checked` attribute (or vice-versa) in a button group using the button.js plugin";
        }
    };
    exports.lintModalsWithinOtherComponents = function ($) {
        var badNestings = $('.table .modal');
        if (badNestings.length) {
            return "Modal markup should not be placed within other components, so as to avoid the component's styles interfering with the modal's appearance or functionality";
        }
    };
    exports.lintPanelBodyWithoutPanel = function ($) {
        var badPanelBody = $('.panel-body').parent(':not(.panel, .panel-collapse)');
        if (badPanelBody.length) {
            return "`.panel-body` must have a `.panel` or `.panel-collapse` parent";
        }
    };
    exports.lintPanelHeadingWithoutPanel = function ($) {
        var badPanelHeading = $('.panel-heading').parent(':not(.panel)');
        if (badPanelHeading.length) {
            return "`.panel-heading` must have a `.panel` parent";
        }
    };
    exports.lintPanelFooterWithoutPanel = function ($) {
        var badPanelFooter = $('.panel-footer').parent(':not(.panel)');
        if (badPanelFooter.length) {
            return "`.panel-footer` must have a `.panel` parent";
        }
    };
    exports.lintPanelTitleWithoutPanelHeading = function ($) {
        var badPanelTitle = $('.panel-title').parent(':not(.panel-heading)');
        if (badPanelTitle.length) {
            return "`.panel-title` must have a `.panel-heading` parent";
        }
    };
    exports.lintTableResponsive = function ($) {
        var badStructure = $('.table.table-responsive,table.table-responsive');
        if (badStructure.length) {
            return "`.table-responsive` is supposed to be used on the table's parent wrapper <div>, not on the table itself";
        }
    };
    exports.lintFormControlFeedbackWithoutHasFeedback = function ($) {
        var ancestorsMissingClasses = $('.form-control-feedback').filter(function () {
            return $(this).closest('.form-group.has-feedback').length !== 1;
        });
        if (ancestorsMissingClasses.length) {
            return "`.form-control-feedback` must have a `.form-group.has-feedback` ancestor";
        }
    };
    exports.lintRedundantColumnClasses = function ($) {
        var columns = $(COL_CLASSES.join(','));
        var errs = [];
        columns.each(function (_index, column) {
            var classes = $(column).attr('class');
            var simplifiedClasses = classes;
            var width2screens = width2screensFor(classes);
            var isRedundant = false;
            for (var width = 1; width <= NUM_COLS; width++) {
                var screens = width2screens[width];
                if (!screens) {
                    continue;
                }
                var runs = incrementingRunsFrom(screens);
                if (!runs.length) {
                    continue;
                }

                isRedundant = true;

                for (var i = 0; i < runs.length; i++) {
                    var run = runs[i];
                    var min = run[0];
                    var max = run[1];

                    // remove redundant classes
                    for (var screenNum = min + 1; screenNum <= max; screenNum++) {
                        var colClass = 'col-' + NUM2SCREEN[screenNum] + '-' + width;
                        simplifiedClasses = withoutClass(simplifiedClasses, colClass);
                    }
                }
            }
            if (!isRedundant) {
                return;
            }

            simplifiedClasses = sortedColumnClasses(simplifiedClasses);
            simplifiedClasses = simplifiedClasses.replace(/ {2,}/g, ' ').trim();
            var oldClass = 'class="' + classes + '"';
            var newClass = 'class="' + simplifiedClasses + '"';
            errs.push(
                "Since grid classes apply to devices with screen widths greater than or equal to the breakpoint sizes (unless overridden by grid classes targeting larger screens), " +
                oldClass + " is redundant and can be simplified to " + newClass
            );
        });
        return errs;
    };

    exports._lint = function ($) {
        var errs = [];
        errs.push(this.lintDoctype($));
        errs.push(this.lintMetaCharsetUtf8($));
        errs.push(this.lintXUaCompatible($));
        errs.push(this.lintBootstrapv2($));
        errs.push(this.lintContainers($));
        errs.push(this.lintNestedContainers($));
        errs.push(this.lintViewport($));
        errs.push(this.lintRowAndColOnSameElem($));
        errs.push(this.lintRowChildrenAreCols($));
        errs.push(this.lintColParentsAreRowsOrFormGroups($));
        errs.push(this.lintRemoteModals($));
        errs.push(this.lintJquery($));
        errs.push(this.lintBootstrapJs($));
        errs.push(this.lintTooltipsOnDisabledElems($));
        errs.push(this.lintTooltipsInBtnGroups($));
        errs.push(this.lintMultipleFormControlsInInputGroup($));
        errs.push(this.lintMissingInputGroupSizes($));
        errs.push(this.lintFormGroupMixedWithInputGroup($));
        errs.push(this.lintGridClassMixedWithInputGroup($));
        errs.push(this.lintInputGroupsWithMultipleAddOnsPerSide($));
        errs.push(this.lintBtnToggle($));
        errs.push(this.lintBtnType($));
        errs.push(this.lintBlockCheckboxes($));
        errs.push(this.lintBlockRadios($));
        errs.push(this.lintButtonsCheckedActive($));
        errs.push(this.lintModalsWithinOtherComponents($));
        errs.push(this.lintPanelBodyWithoutPanel($));
        errs.push(this.lintPanelHeadingWithoutPanel($));
        errs.push(this.lintPanelTitleWithoutPanelHeading($));
        errs.push(this.lintPanelFooterWithoutPanel($));
        errs.push(this.lintTableResponsive($));
        errs.push(this.lintFormControlFeedbackWithoutHasFeedback($));
        errs = errs.concat(this.lintInputGroupFormControlTypes($));
        errs = errs.concat(this.lintInlineCheckboxes($));
        errs = errs.concat(this.lintInlineRadios($));
        errs = errs.concat(this.lintRedundantColumnClasses($));
        errs = errs.filter(function (item) {
            return item !== undefined;
        });
        return errs;
    };
    if (IN_NODE_JS) {
        // cheerio; Node.js
        /**
         * Lints the given HTML.
         * @param {string} html The HTML to lint
         * @returns {string[]} List of lint warnings
         */
        exports.lintHtml = function (html) {
            var $ = cheerio.load(html);
            return this._lint($);
        };
    }
    else {
        // jQuery; in-browser
        (function () {
            var $ = cheerio;
            /**
             * Lints the HTML of the current document.
             * @returns {string[]} List of lint warnings
             */
            exports.lintCurrentDocument = function () {
                return this._lint($);
            };
            /**
             * Lints the HTML of the current document.
             * If there are any lint warnings, one general notification message will be window.alert()-ed to the user.
             * Each warning will be output individually using console.warn().
             * @returns {undefined} Nothing
             */
            exports.showLintReportForCurrentDocument = function () {
                var errs = this.lintCurrentDocument();
                if (errs.length) {
                    /*eslint-disable no-alert, no-undef */
                    window.alert("bootlint found errors in this document! See the JavaScript console for details.");
                    /*eslint-enable no-alert, no-undef */
                    errs.forEach(function (err) {
                        console.warn("bootlint:", err);
                    });
                }
            };
            /*eslint-disable no-undef */
            window.bootlint = exports;
            /*eslint-enable no-undef */
            $(function () {
                exports.showLintReportForCurrentDocument();
            });
        })();
    }
})(typeof exports === 'object' && exports || this);
