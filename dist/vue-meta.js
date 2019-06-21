/**
 * vue-meta v2.0.3
 * (c) 2019
 * - Declan de Wet
 * - Sébastien Chopin (@Atinux)
  * - All the amazing contributors
 * @license MIT
 */

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = global || self, global.VueMeta = factory());
}(this, function () { 'use strict';

  var version = "2.0.3";

  // store an id to keep track of DOM updates
  var batchId = null;

  function triggerUpdate(vm, hookName) {
    // if an update was triggered during initialization or when an update was triggered by the
    // metaInfo watcher, set initialized to null
    // then we keep falsy value but know we need to run a triggerUpdate after initialization
    if (!vm.$root._vueMeta.initialized && (vm.$root._vueMeta.initializing || hookName === 'watcher')) {
      vm.$root._vueMeta.initialized = null;
    }

    if (vm.$root._vueMeta.initialized && !vm.$root._vueMeta.paused) {
      // batch potential DOM updates to prevent extraneous re-rendering
      batchUpdate(function () { return vm.$meta().refresh(); });
    }
  }

  /**
   * Performs a batched update.
   *
   * @param  {(null|Number)} id - the ID of this update
   * @param  {Function} callback - the update to perform
   * @return {Number} id - a new ID
   */
  function batchUpdate(callback, timeout) {
    if ( timeout === void 0 ) timeout = 10;

    clearTimeout(batchId);

    batchId = setTimeout(function () {
      callback();
    }, timeout);

    return batchId
  }

  /**
   * checks if passed argument is an array
   * @param  {any}  arg - the object to check
   * @return {Boolean} - true if `arg` is an array
   */
  function isArray(arg) {
    return Array.isArray(arg)
  }

  function isUndefined(arg) {
    return typeof arg === 'undefined'
  }

  function isObject(arg) {
    return typeof arg === 'object'
  }

  function isFunction(arg) {
    return typeof arg === 'function'
  }

  function isString(arg) {
    return typeof arg === 'string'
  }

  function ensureIsArray(arg, key) {
    if (!key || !isObject(arg)) {
      return isArray(arg) ? arg : []
    }

    if (!isArray(arg[key])) {
      arg[key] = [];
    }
    return arg
  }

  function ensuredPush(object, key, el) {
    ensureIsArray(object, key);

    object[key].push(el);
  }

  // Vue $root instance has a _vueMeta object property, otherwise its a boolean true
  function hasMetaInfo(vm) {
    if ( vm === void 0 ) vm = this;

    return vm && (vm._vueMeta === true || isObject(vm._vueMeta))
  }

  // a component is in a metaInfo branch when itself has meta info or one of its (grand-)children has
  function inMetaInfoBranch(vm) {
    if ( vm === void 0 ) vm = this;

    return vm && !isUndefined(vm._vueMeta)
  }

  function addNavGuards(vm) {
    // return when nav guards already added or no router exists
    if (vm.$root._vueMeta.navGuards || !vm.$root.$router) {
      /* istanbul ignore next */
      return
    }

    vm.$root._vueMeta.navGuards = true;

    var $router = vm.$root.$router;
    var $meta = vm.$root.$meta();

    $router.beforeEach(function (to, from, next) {
      $meta.pause();
      next();
    });

    $router.afterEach(function () {
      var ref = $meta.resume();
      var metaInfo = ref.metaInfo;
      if (metaInfo && metaInfo.afterNavigation && isFunction(metaInfo.afterNavigation)) {
        metaInfo.afterNavigation(metaInfo);
      }
    });
  }

  var appId = 1;

  function createMixin(Vue, options) {
    // for which Vue lifecycle hooks should the metaInfo be refreshed
    var updateOnLifecycleHook = ['activated', 'deactivated', 'beforeMount'];

    // watch for client side component updates
    return {
      beforeCreate: function beforeCreate() {
        var this$1 = this;

        Object.defineProperty(this, '_hasMetaInfo', {
          configurable: true,
          get: function get() {
            // Show deprecation warning once when devtools enabled
            if (Vue.config.devtools && !this.$root._vueMeta.hasMetaInfoDeprecationWarningShown) {
              console.warn('VueMeta DeprecationWarning: _hasMetaInfo has been deprecated and will be removed in a future version. Please use hasMetaInfo(vm) instead'); // eslint-disable-line no-console
              this.$root._vueMeta.hasMetaInfoDeprecationWarningShown = true;
            }
            return hasMetaInfo(this)
          }
        });

        // Add a marker to know if it uses metaInfo
        // _vnode is used to know that it's attached to a real component
        // useful if we use some mixin to add some meta tags (like nuxt-i18n)
        if (!isUndefined(this.$options[options.keyName]) && this.$options[options.keyName] !== null) {
          if (!this.$root._vueMeta) {
            this.$root._vueMeta = { appId: appId };
            appId++;
          }

          // to speed up updates we keep track of branches which have a component with vue-meta info defined
          // if _vueMeta = true it has info, if _vueMeta = false a child has info
          if (!this._vueMeta) {
            this._vueMeta = true;

            var p = this.$parent;
            while (p && p !== this.$root) {
              if (isUndefined(p._vueMeta)) {
                p._vueMeta = false;
              }
              p = p.$parent;
            }
          }

          // coerce function-style metaInfo to a computed prop so we can observe
          // it on creation
          if (isFunction(this.$options[options.keyName])) {
            if (!this.$options.computed) {
              this.$options.computed = {};
            }
            this.$options.computed.$metaInfo = this.$options[options.keyName];

            if (!this.$isServer) {
              // if computed $metaInfo exists, watch it for updates & trigger a refresh
              // when it changes (i.e. automatically handle async actions that affect metaInfo)
              // credit for this suggestion goes to [Sébastien Chopin](https://github.com/Atinux)
              ensuredPush(this.$options, 'created', function () {
                this$1.$watch('$metaInfo', function () {
                  triggerUpdate(this, 'watcher');
                });
              });
            }
          }

          // force an initial refresh on page load and prevent other lifecycleHooks
          // to triggerUpdate until this initial refresh is finished
          // this is to make sure that when a page is opened in an inactive tab which
          // has throttled rAF/timers we still immediately set the page title
          if (isUndefined(this.$root._vueMeta.initialized)) {
            this.$root._vueMeta.initialized = this.$isServer;

            if (!this.$root._vueMeta.initialized) {
              ensuredPush(this.$options, 'beforeMount', function () {
                // if this Vue-app was server rendered, set the appId to 'ssr'
                // only one SSR app per page is supported
                if (this$1.$root.$el && this$1.$root.$el.hasAttribute('data-server-rendered')) {
                  this$1.$root._vueMeta.appId = 'ssr';
                }
              });

              // we use the mounted hook here as on page load
              ensuredPush(this.$options, 'mounted', function () {
                if (!this$1.$root._vueMeta.initialized) {
                  // used in triggerUpdate to check if a change was triggered
                  // during initialization
                  this$1.$root._vueMeta.initializing = true;

                  // refresh meta in nextTick so all child components have loaded
                  this$1.$nextTick(function () {
                    var this$1 = this;

                    var ref = this.$root.$meta().refresh();
                    var tags = ref.tags;
                    var metaInfo = ref.metaInfo;

                    // After ssr hydration (identifier by tags === false) check
                    // if initialized was set to null in triggerUpdate. That'd mean
                    // that during initilazation changes where triggered which need
                    // to be applied OR a metaInfo watcher was triggered before the
                    // current hook was called
                    // (during initialization all changes are blocked)
                    if (tags === false && this.$root._vueMeta.initialized === null) {
                      this.$nextTick(function () { return triggerUpdate(this$1, 'initializing'); });
                    }

                    this.$root._vueMeta.initialized = true;
                    delete this.$root._vueMeta.initializing;

                    // add the navigation guards if they havent been added yet
                    // they are needed for the afterNavigation callback
                    if (!options.refreshOnceOnNavigation && metaInfo.afterNavigation) {
                      addNavGuards(this);
                    }
                  });
                }
              });

              // add the navigation guards if requested
              if (options.refreshOnceOnNavigation) {
                addNavGuards(this);
              }
            }
          }

          // do not trigger refresh on the server side
          if (!this.$isServer) {
            // no need to add this hooks on server side
            updateOnLifecycleHook.forEach(function (lifecycleHook) {
              ensuredPush(this$1.$options, lifecycleHook, function () { return triggerUpdate(this$1, lifecycleHook); });
            });

            // re-render meta data when returning from a child component to parent
            ensuredPush(this.$options, 'destroyed', function () {
              // Wait that element is hidden before refreshing meta tags (to support animations)
              var interval = setInterval(function () {
                if (this$1.$el && this$1.$el.offsetParent !== null) {
                  /* istanbul ignore next line */
                  return
                }

                clearInterval(interval);

                if (!this$1.$parent) {
                  /* istanbul ignore next line */
                  return
                }

                triggerUpdate(this$1, 'destroyed');
              }, 50);
            });
          }
        }
      }
    }
  }

  /**
   * These are constant variables used throughout the application.
   */

  // set some sane defaults
  var defaultInfo = {
    title: '',
    titleChunk: '',
    titleTemplate: '%s',
    htmlAttrs: {},
    bodyAttrs: {},
    headAttrs: {},
    base: [],
    link: [],
    meta: [],
    style: [],
    script: [],
    noscript: [],
    __dangerouslyDisableSanitizers: [],
    __dangerouslyDisableSanitizersByTagID: {}
  };

  // This is the name of the component option that contains all the information that
  // gets converted to the various meta tags & attributes for the page.
  var keyName = 'metaInfo';

  // This is the attribute vue-meta arguments on elements to know which it should
  // manage and which it should ignore.
  var attribute = 'data-vue-meta';

  // This is the attribute that goes on the `html` tag to inform `vue-meta`
  // that the server has already generated the meta tags for the initial render.
  var ssrAttribute = 'data-vue-meta-server-rendered';

  // This is the property that tells vue-meta to overwrite (instead of append)
  // an item in a tag list. For example, if you have two `meta` tag list items
  // that both have `vmid` of "description", then vue-meta will overwrite the
  // shallowest one with the deepest one.
  var tagIDKeyName = 'vmid';

  // This is the key name for possible meta templates
  var metaTemplateKeyName = 'template';

  // This is the key name for the content-holding property
  var contentKeyName = 'content';

  var defaultOptions = {
    keyName: keyName,
    attribute: attribute,
    ssrAttribute: ssrAttribute,
    tagIDKeyName: tagIDKeyName,
    contentKeyName: contentKeyName,
    metaTemplateKeyName: metaTemplateKeyName
  };

  // List of metaInfo property keys which are configuration options (and dont generate html)
  var metaInfoOptionKeys = [
    'titleChunk',
    'titleTemplate',
    'changed',
    '__dangerouslyDisableSanitizers',
    '__dangerouslyDisableSanitizersByTagID'
  ];

  // The metaInfo property keys which are used to disable escaping
  var disableOptionKeys = [
    '__dangerouslyDisableSanitizers',
    '__dangerouslyDisableSanitizersByTagID'
  ];

  // List of metaInfo property keys which only generates attributes and no tags
  var metaInfoAttributeKeys = [
    'htmlAttrs',
    'headAttrs',
    'bodyAttrs'
  ];

  // from: https://github.com/kangax/html-minifier/blob/gh-pages/src/htmlminifier.js#L202
  var booleanHtmlAttributes = [
    'allowfullscreen',
    'amp',
    'async',
    'autofocus',
    'autoplay',
    'checked',
    'compact',
    'controls',
    'declare',
    'default',
    'defaultchecked',
    'defaultmuted',
    'defaultselected',
    'defer',
    'disabled',
    'enabled',
    'formnovalidate',
    'hidden',
    'indeterminate',
    'inert',
    'ismap',
    'itemscope',
    'loop',
    'multiple',
    'muted',
    'nohref',
    'noresize',
    'noshade',
    'novalidate',
    'nowrap',
    'open',
    'pauseonexit',
    'readonly',
    'required',
    'reversed',
    'scoped',
    'seamless',
    'selected',
    'sortable',
    'truespeed',
    'typemustmatch',
    'visible'
  ];

  // eslint-disable-next-line no-console
  var showWarningNotSupported = function () { return console.warn('This vue app/component has no vue-meta configuration'); };

  function setOptions(options) {
    // combine options
    options = isObject(options) ? options : {};

    for (var key in defaultOptions) {
      if (!options[key]) {
        options[key] = defaultOptions[key];
      }
    }

    return options
  }

  function getOptions(options) {
    var optionsCopy = {};
    for (var key in options) {
      optionsCopy[key] = options[key];
    }
    return optionsCopy
  }

  function pause(refresh) {
    if ( refresh === void 0 ) refresh = true;

    this.$root._vueMeta.paused = true;

    return function () { return resume(refresh); }
  }

  function resume(refresh) {
    if ( refresh === void 0 ) refresh = true;

    this.$root._vueMeta.paused = false;

    if (refresh) {
      return this.$root.$meta().refresh()
    }
  }

  function applyTemplate(ref, headObject, template, chunk) {
    var component = ref.component;
    var metaTemplateKeyName = ref.metaTemplateKeyName;
    var contentKeyName = ref.contentKeyName;

    if (isUndefined(template)) {
      template = headObject[metaTemplateKeyName];
      delete headObject[metaTemplateKeyName];
    }

    // return early if no template defined
    if (!template) {
      return false
    }

    if (isUndefined(chunk)) {
      chunk = headObject[contentKeyName];
    }

    headObject[contentKeyName] = isFunction(template)
      ? template.call(component, chunk)
      : template.replace(/%s/g, chunk);

    return true
  }

  /*
   * To reduce build size, this file provides simple polyfills without
   * overly excessive type checking and without modifying
   * the global Array.prototype
   * The polyfills are automatically removed in the commonjs build
   * Also, only files in client/ & shared/ should use these functions
   * files in server/ still use normal js function
   */

  function findIndex(array, predicate) {
    var arguments$1 = arguments;

    if (!Array.prototype.findIndex) {
      // idx needs to be a Number, for..in returns string
      for (var idx = 0; idx < array.length; idx++) {
        if (predicate.call(arguments$1[2], array[idx], idx, array)) {
          return idx
        }
      }
      return -1
    }
    return array.findIndex(predicate, arguments[2])
  }

  function toArray(arg) {
    if (!Array.from) {
      return Array.prototype.slice.call(arg)
    }
    return Array.from(arg)
  }

  function includes(array, value) {
    if (!Array.prototype.includes) {
      for (var idx in array) {
        if (array[idx] === value) {
          return true
        }
      }

      return false
    }
    return array.includes(value)
  }

  var clientSequences = [
    [/&/g, '\u0026'],
    [/</g, '\u003c'],
    [/>/g, '\u003e'],
    [/"/g, '\u0022'],
    [/'/g, '\u0027']
  ];

  // sanitizes potentially dangerous characters
  function escape(info, options, escapeOptions) {
    var tagIDKeyName = options.tagIDKeyName;
    var doEscape = escapeOptions.doEscape; if ( doEscape === void 0 ) doEscape = function (v) { return v; };
    var escaped = {};

    for (var key in info) {
      var value = info[key];

      // no need to escape configuration options
      if (includes(metaInfoOptionKeys, key)) {
        escaped[key] = value;
        continue
      }

      var disableKey = disableOptionKeys[0];
      if (escapeOptions[disableKey] && includes(escapeOptions[disableKey], key)) {
        // this info[key] doesnt need to escaped if the option is listed in __dangerouslyDisableSanitizers
        escaped[key] = value;
        continue
      }

      var tagId = info[tagIDKeyName];
      if (tagId) {
        disableKey = disableOptionKeys[1];

        // keys which are listed in __dangerouslyDisableSanitizersByTagID for the current vmid do not need to be escaped
        if (escapeOptions[disableKey] && escapeOptions[disableKey][tagId] && includes(escapeOptions[disableKey][tagId], key)) {
          escaped[key] = value;
          continue
        }
      }

      if (isString(value)) {
        escaped[key] = doEscape(value);
      } else if (isArray(value)) {
        escaped[key] = value.map(function (v) {
          return isObject(v)
            ? escape(v, options, escapeOptions)
            : doEscape(v)
        });
      } else if (isObject(value)) {
        escaped[key] = escape(value, options, escapeOptions);
      } else {
        escaped[key] = value;
      }
    }

    return escaped
  }

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function createCommonjsModule(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  var umd = createCommonjsModule(function (module, exports) {
  (function (global, factory) {
  	module.exports = factory();
  }(commonjsGlobal, (function () {
  var isMergeableObject = function isMergeableObject(value) {
  	return isNonNullObject(value)
  		&& !isSpecial(value)
  };

  function isNonNullObject(value) {
  	return !!value && typeof value === 'object'
  }

  function isSpecial(value) {
  	var stringValue = Object.prototype.toString.call(value);

  	return stringValue === '[object RegExp]'
  		|| stringValue === '[object Date]'
  		|| isReactElement(value)
  }

  // see https://github.com/facebook/react/blob/b5ac963fb791d1298e7f396236383bc955f916c1/src/isomorphic/classic/element/ReactElement.js#L21-L25
  var canUseSymbol = typeof Symbol === 'function' && Symbol.for;
  var REACT_ELEMENT_TYPE = canUseSymbol ? Symbol.for('react.element') : 0xeac7;

  function isReactElement(value) {
  	return value.$$typeof === REACT_ELEMENT_TYPE
  }

  function emptyTarget(val) {
  	return Array.isArray(val) ? [] : {}
  }

  function cloneUnlessOtherwiseSpecified(value, options) {
  	return (options.clone !== false && options.isMergeableObject(value))
  		? deepmerge(emptyTarget(value), value, options)
  		: value
  }

  function defaultArrayMerge(target, source, options) {
  	return target.concat(source).map(function(element) {
  		return cloneUnlessOtherwiseSpecified(element, options)
  	})
  }

  function getMergeFunction(key, options) {
  	if (!options.customMerge) {
  		return deepmerge
  	}
  	var customMerge = options.customMerge(key);
  	return typeof customMerge === 'function' ? customMerge : deepmerge
  }

  function mergeObject(target, source, options) {
  	var destination = {};
  	if (options.isMergeableObject(target)) {
  		Object.keys(target).forEach(function(key) {
  			destination[key] = cloneUnlessOtherwiseSpecified(target[key], options);
  		});
  	}
  	Object.keys(source).forEach(function(key) {
  		if (!options.isMergeableObject(source[key]) || !target[key]) {
  			destination[key] = cloneUnlessOtherwiseSpecified(source[key], options);
  		} else {
  			destination[key] = getMergeFunction(key, options)(target[key], source[key], options);
  		}
  	});
  	return destination
  }

  function deepmerge(target, source, options) {
  	options = options || {};
  	options.arrayMerge = options.arrayMerge || defaultArrayMerge;
  	options.isMergeableObject = options.isMergeableObject || isMergeableObject;

  	var sourceIsArray = Array.isArray(source);
  	var targetIsArray = Array.isArray(target);
  	var sourceAndTargetTypesMatch = sourceIsArray === targetIsArray;

  	if (!sourceAndTargetTypesMatch) {
  		return cloneUnlessOtherwiseSpecified(source, options)
  	} else if (sourceIsArray) {
  		return options.arrayMerge(target, source, options)
  	} else {
  		return mergeObject(target, source, options)
  	}
  }

  deepmerge.all = function deepmergeAll(array, options) {
  	if (!Array.isArray(array)) {
  		throw new Error('first argument should be an array')
  	}

  	return array.reduce(function(prev, next) {
  		return deepmerge(prev, next, options)
  	}, {})
  };

  var deepmerge_1 = deepmerge;

  return deepmerge_1;

  })));
  });

  function arrayMerge(ref, target, source) {
    var component = ref.component;
    var tagIDKeyName = ref.tagIDKeyName;
    var metaTemplateKeyName = ref.metaTemplateKeyName;
    var contentKeyName = ref.contentKeyName;

    // we concat the arrays without merging objects contained in,
    // but we check for a `vmid` property on each object in the array
    // using an O(1) lookup associative array exploit
    var destination = [];

    target.forEach(function (targetItem, targetIndex) {
      // no tagID so no need to check for duplicity
      if (!targetItem[tagIDKeyName]) {
        destination.push(targetItem);
        return
      }

      var sourceIndex = findIndex(source, function (item) { return item[tagIDKeyName] === targetItem[tagIDKeyName]; });
      var sourceItem = source[sourceIndex];

      // source doesnt contain any duplicate vmid's, we can keep targetItem
      if (sourceIndex === -1) {
        destination.push(targetItem);
        return
      }

      // when sourceItem explictly defines contentKeyName or innerHTML as undefined, its
      // an indication that we need to skip the default behaviour or child has preference over parent
      // which means we keep the targetItem and ignore/remove the sourceItem
      if ((sourceItem.hasOwnProperty(contentKeyName) && sourceItem[contentKeyName] === undefined) ||
        (sourceItem.hasOwnProperty('innerHTML') && sourceItem.innerHTML === undefined)) {
        destination.push(targetItem);
        // remove current index from source array so its not concatenated to destination below
        source.splice(sourceIndex, 1);
        return
      }

      // we now know that targetItem is a duplicate and we should ignore it in favor of sourceItem

      // if source specifies null as content then ignore both the target as the source
      if (sourceItem[contentKeyName] === null || sourceItem.innerHTML === null) {
        // remove current index from source array so its not concatenated to destination below
        source.splice(sourceIndex, 1);
        return
      }

      // now we only need to check if the target has a template to combine it with the source
      var targetTemplate = targetItem[metaTemplateKeyName];
      if (!targetTemplate) {
        return
      }

      var sourceTemplate = sourceItem[metaTemplateKeyName];

      if (!sourceTemplate) {
        // use parent template and child content
        applyTemplate({ component: component, metaTemplateKeyName: metaTemplateKeyName, contentKeyName: contentKeyName }, sourceItem, targetTemplate);
      } else if (!sourceItem[contentKeyName]) {
        // use child template and parent content
        applyTemplate({ component: component, metaTemplateKeyName: metaTemplateKeyName, contentKeyName: contentKeyName }, sourceItem, undefined, targetItem[contentKeyName]);
      }
    });

    return destination.concat(source)
  }

  function merge(target, source, options) {
    if ( options === void 0 ) options = {};

    // remove properties explicitly set to false so child components can
    // optionally _not_ overwrite the parents content
    // (for array properties this is checked in arrayMerge)
    if (source.hasOwnProperty('title') && source.title === undefined) {
      delete source.title;
    }

    metaInfoAttributeKeys.forEach(function (attrKey) {
      if (!source[attrKey]) {
        return
      }

      for (var key in source[attrKey]) {
        if (source[attrKey].hasOwnProperty(key) && source[attrKey][key] === undefined) {
          delete source[attrKey][key];
        }
      }
    });

    return umd(target, source, {
      arrayMerge: function (t, s) { return arrayMerge(options, t, s); }
    })
  }

  /**
   * Returns the `opts.option` $option value of the given `opts.component`.
   * If methods are encountered, they will be bound to the component context.
   * If `opts.deep` is true, will recursively merge all child component
   * `opts.option` $option values into the returned result.
   *
   * @param  {Object} opts - options
   * @param  {Object} opts.component - Vue component to fetch option data from
   * @param  {Boolean} opts.deep - look for data in child components as well?
   * @param  {Function} opts.arrayMerge - how should arrays be merged?
   * @param  {String} opts.keyName - the name of the option to look for
   * @param  {Object} [result={}] - result so far
   * @return {Object} result - final aggregated result
   */
  function getComponentOption(options, component, result) {
    if ( options === void 0 ) options = {};
    if ( result === void 0 ) result = {};

    var keyName = options.keyName;
    var metaTemplateKeyName = options.metaTemplateKeyName;
    var tagIDKeyName = options.tagIDKeyName;
    var $options = component.$options;
    var $children = component.$children;

    if (component._inactive) {
      return result
    }

    // only collect option data if it exists
    if ($options[keyName]) {
      var data = $options[keyName];

      // if option is a function, replace it with it's result
      if (isFunction(data)) {
        data = data.call(component);
      }

      // ignore data if its not an object, then we keep our previous result
      if (!isObject(data)) {
        return result
      }

      // merge with existing options
      result = merge(result, data, options);
    }

    // collect & aggregate child options if deep = true
    if ($children.length) {
      $children.forEach(function (childComponent) {
        // check if the childComponent is in a branch
        // return otherwise so we dont walk all component branches unnecessarily
        if (!inMetaInfoBranch(childComponent)) {
          return
        }

        result = getComponentOption(options, childComponent, result);
      });
    }

    if (metaTemplateKeyName && result.meta) {
      // apply templates if needed
      result.meta.forEach(function (metaObject) { return applyTemplate(options, metaObject); });

      // remove meta items with duplicate vmid's
      result.meta = result.meta.filter(function (metaItem, index, arr) {
        return (
          // keep meta item if it doesnt has a vmid
          !metaItem.hasOwnProperty(tagIDKeyName) ||
          // or if it's the first item in the array with this vmid
          index === findIndex(arr, function (item) { return item[tagIDKeyName] === metaItem[tagIDKeyName]; })
        )
      });
    }

    return result
  }

  /**
   * Returns the correct meta info for the given component
   * (child components will overwrite parent meta info)
   *
   * @param  {Object} component - the Vue instance to get meta info from
   * @return {Object} - returned meta info
   */
  function getMetaInfo(options, component, escapeSequences) {
    if ( options === void 0 ) options = {};
    if ( escapeSequences === void 0 ) escapeSequences = [];

    // collect & aggregate all metaInfo $options
    var info = getComponentOption(options, component, defaultInfo);

    // Remove all "template" tags from meta

    // backup the title chunk in case user wants access to it
    if (info.title) {
      info.titleChunk = info.title;
    }

    // replace title with populated template
    if (info.titleTemplate && info.titleTemplate !== '%s') {
      applyTemplate({ component: component, contentKeyName: 'title' }, info, info.titleTemplate, info.titleChunk || '');
    }

    // convert base tag to an array so it can be handled the same way
    // as the other tags
    if (info.base) {
      info.base = Object.keys(info.base).length ? [info.base] : [];
    }

    var escapeOptions = {
      doEscape: function (value) { return escapeSequences.reduce(function (val, ref) {
        var v = ref[0];
        var r = ref[1];

        return val.replace(v, r);
        }, value); }
    };

    disableOptionKeys.forEach(function (disableKey, index) {
      if (index === 0) {
        ensureIsArray(info, disableKey);
      } else if (index === 1) {
        for (var key in info[disableKey]) {
          ensureIsArray(info[disableKey], key);
        }
      }

      escapeOptions[disableKey] = info[disableKey];
    });

    // begin sanitization
    info = escape(info, options, escapeOptions);

    return info
  }

  /**
   * Updates the document's html tag attributes
   *
   * @param  {Object} attrs - the new document html attributes
   * @param  {HTMLElement} tag - the HTMLElement tag to update with new attrs
   */
  function updateAttribute(ref, attrs, tag) {
    if ( ref === void 0 ) ref = {};
    var attribute = ref.attribute;

    var vueMetaAttrString = tag.getAttribute(attribute);
    var vueMetaAttrs = vueMetaAttrString ? vueMetaAttrString.split(',') : [];
    var toRemove = toArray(vueMetaAttrs);

    var keepIndexes = [];
    for (var attr in attrs) {
      if (attrs.hasOwnProperty(attr)) {
        var value = includes(booleanHtmlAttributes, attr)
          ? ''
          : isArray(attrs[attr]) ? attrs[attr].join(' ') : attrs[attr];

        tag.setAttribute(attr, value || '');

        if (!includes(vueMetaAttrs, attr)) {
          vueMetaAttrs.push(attr);
        }

        // filter below wont ever check -1
        keepIndexes.push(toRemove.indexOf(attr));
      }
    }

    var removedAttributesCount = toRemove
      .filter(function (el, index) { return !includes(keepIndexes, index); })
      .reduce(function (acc, attr) {
        tag.removeAttribute(attr);
        return acc + 1
      }, 0);

    if (vueMetaAttrs.length === removedAttributesCount) {
      tag.removeAttribute(attribute);
    } else {
      tag.setAttribute(attribute, (vueMetaAttrs.sort()).join(','));
    }
  }

  /**
   * Updates the document title
   *
   * @param  {String} title - the new title of the document
   */
  function updateTitle(title) {
    if ( title === void 0 ) title = document.title;

    document.title = title;
  }

  /**
   * Updates meta tags inside <head> and <body> on the client. Borrowed from `react-helmet`:
   * https://github.com/nfl/react-helmet/blob/004d448f8de5f823d10f838b02317521180f34da/src/Helmet.js#L195-L245
   *
   * @param  {('meta'|'base'|'link'|'style'|'script'|'noscript')} type - the name of the tag
   * @param  {(Array<Object>|Object)} tags - an array of tag objects or a single object in case of base
   * @return {Object} - a representation of what tags changed
   */
  function updateTag(appId, ref, type, tags, headTag, bodyTag) {
    if ( ref === void 0 ) ref = {};
    var attribute = ref.attribute;
    var tagIDKeyName = ref.tagIDKeyName;

    var oldHeadTags = toArray(headTag.querySelectorAll((type + "[" + attribute + "=\"" + appId + "\"], " + type + "[data-" + tagIDKeyName + "]")));
    var oldBodyTags = toArray(bodyTag.querySelectorAll((type + "[" + attribute + "=\"" + appId + "\"][data-body=\"true\"], " + type + "[data-" + tagIDKeyName + "][data-body=\"true\"]")));
    var dataAttributes = [tagIDKeyName, 'body'];
    var newTags = [];

    if (tags.length > 1) {
      // remove duplicates that could have been found by merging tags
      // which include a mixin with metaInfo and that mixin is used
      // by multiple components on the same page
      var found = [];
      tags = tags.filter(function (x) {
        var k = JSON.stringify(x);
        var res = !includes(found, k);
        found.push(k);
        return res
      });
    }

    if (tags.length) {
      tags.forEach(function (tag) {
        var newElement = document.createElement(type);

        newElement.setAttribute(attribute, appId);

        var oldTags = tag.body !== true ? oldHeadTags : oldBodyTags;

        for (var attr in tag) {
          if (tag.hasOwnProperty(attr)) {
            if (attr === 'innerHTML') {
              newElement.innerHTML = tag.innerHTML;
            } else if (attr === 'cssText') {
              if (newElement.styleSheet) {
                /* istanbul ignore next */
                newElement.styleSheet.cssText = tag.cssText;
              } else {
                newElement.appendChild(document.createTextNode(tag.cssText));
              }
            } else {
              var _attr = includes(dataAttributes, attr)
                ? ("data-" + attr)
                : attr;
              var value = isUndefined(tag[attr]) || includes(booleanHtmlAttributes, attr) ? '' : tag[attr];
              newElement.setAttribute(_attr, value);
            }
          }
        }

        // Remove a duplicate tag from domTagstoRemove, so it isn't cleared.
        var indexToDelete;
        var hasEqualElement = oldTags.some(function (existingTag, index) {
          indexToDelete = index;
          return newElement.isEqualNode(existingTag)
        });

        if (hasEqualElement && (indexToDelete || indexToDelete === 0)) {
          oldTags.splice(indexToDelete, 1);
        } else {
          newTags.push(newElement);
        }
      });
    }

    var oldTags = oldHeadTags.concat(oldBodyTags);
    oldTags.forEach(function (tag) { return tag.parentNode.removeChild(tag); });
    newTags.forEach(function (tag) {
      if (tag.getAttribute('data-body') === 'true') {
        bodyTag.appendChild(tag);
      } else {
        headTag.appendChild(tag);
      }
    });

    return { oldTags: oldTags, newTags: newTags }
  }

  function getTag(tags, tag) {
    if (!tags[tag]) {
      tags[tag] = document.getElementsByTagName(tag)[0];
    }

    return tags[tag]
  }

  /**
   * Performs client-side updates when new meta info is received
   *
   * @param  {Object} newInfo - the meta info to update to
   */
  function updateClientMetaInfo(appId, options, newInfo) {
    if ( options === void 0 ) options = {};

    var ssrAttribute = options.ssrAttribute;

    // only cache tags for current update
    var tags = {};

    var htmlTag = getTag(tags, 'html');

    // if this is a server render, then dont update
    if (appId === 'ssr' && htmlTag.hasAttribute(ssrAttribute)) {
      // remove the server render attribute so we can update on (next) changes
      htmlTag.removeAttribute(ssrAttribute);
      return false
    }

    // initialize tracked changes
    var addedTags = {};
    var removedTags = {};

    for (var type in newInfo) {
      // ignore these
      if (includes(metaInfoOptionKeys, type)) {
        continue
      }

      if (type === 'title') {
        // update the title
        updateTitle(newInfo.title);
        continue
      }

      if (includes(metaInfoAttributeKeys, type)) {
        var tagName = type.substr(0, 4);
        updateAttribute(options, newInfo[type], getTag(tags, tagName));
        continue
      }

      // tags should always be an array, ignore if it isnt
      if (!isArray(newInfo[type])) {
        continue
      }

      var ref = updateTag(
        appId,
        options,
        type,
        newInfo[type],
        getTag(tags, 'head'),
        getTag(tags, 'body')
      );
      var oldTags = ref.oldTags;
      var newTags = ref.newTags;

      if (newTags.length) {
        addedTags[type] = newTags;
        removedTags[type] = oldTags;
      }
    }

    return { addedTags: addedTags, removedTags: removedTags }
  }

  function _refresh(options) {
    if ( options === void 0 ) options = {};

    /**
     * When called, will update the current meta info with new meta info.
     * Useful when updating meta info as the result of an asynchronous
     * action that resolves after the initial render takes place.
     *
     * Credit to [Sébastien Chopin](https://github.com/Atinux) for the suggestion
     * to implement this method.
     *
     * @return {Object} - new meta info
     */
    return function refresh() {
      var metaInfo = getMetaInfo(options, this.$root, clientSequences);

      var appId = this.$root._vueMeta.appId;
      var tags = updateClientMetaInfo(appId, options, metaInfo);
      // emit "event" with new info
      if (tags && isFunction(metaInfo.changed)) {
        metaInfo.changed(metaInfo, tags.addedTags, tags.removedTags);
      }

      return { vm: this, metaInfo: metaInfo, tags: tags }
    }
  }

  function _$meta(options) {
    if ( options === void 0 ) options = {};

    var _refresh$1 = _refresh(options);
    var inject = function () {};

    /**
     * Returns an injector for server-side rendering.
     * @this {Object} - the Vue instance (a root component)
     * @return {Object} - injector
     */
    return function $meta() {
      if (!this.$root._vueMeta) {
        return {
          getOptions: showWarningNotSupported,
          refresh: showWarningNotSupported,
          inject: showWarningNotSupported,
          pause: showWarningNotSupported,
          resume: showWarningNotSupported
        }
      }

      return {
        getOptions: function () { return getOptions(options); },
        refresh: _refresh$1.bind(this),
        inject: inject,
        pause: pause.bind(this),
        resume: resume.bind(this)
      }
    }
  }

  /**
   * Plugin install function.
   * @param {Function} Vue - the Vue constructor.
   */
  function install(Vue, options) {
    if ( options === void 0 ) options = {};

    if (Vue.__vuemeta_installed) {
      return
    }
    Vue.__vuemeta_installed = true;

    options = setOptions(options);

    Vue.prototype.$meta = _$meta(options);

    Vue.mixin(createMixin(Vue, options));
  }

  // automatic install
  if (!isUndefined(window) && !isUndefined(window.Vue)) {
    /* istanbul ignore next */
    install(window.Vue);
  }

  var browser = {
    version: version,
    install: install,
    hasMetaInfo: hasMetaInfo
  };

  return browser;

}));
