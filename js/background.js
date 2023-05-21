/*******************************************************************************

    uBlock Origin - a browser extension to block requests.
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/


'use strict';

/******************************************************************************/

// Not all platforms may have properly declared vAPI.webextFlavor.

if (vAPI.webextFlavor === undefined) {
    vAPI.webextFlavor = { major: 0, soup: new Set(['ublock']) };
}


/******************************************************************************/

const µBlock = (() => { // jshint ignore:line

    const hiddenSettingsDefault = {
        allowGenericProceduralFilters: false,
        assetFetchTimeout: 30,
        autoCommentFilterTemplate: '{{date}} {{origin}}',
        autoUpdateAssetFetchPeriod: 120,
        autoUpdateDelayAfterLaunch: 180,
        autoUpdatePeriod: 4,
        benchmarkDatasetURL: 'unset',
        blockingProfiles: '11111/#F00 11010/#C0F 11001/#00F 00001',
        cacheStorageAPI: 'unset',
        cacheStorageCompression: true,
        cacheControlForFirefox1376932: 'no-cache, no-store, must-revalidate',
        cloudStorageCompression: true,
        cnameIgnoreList: 'unset',
        cnameIgnore1stParty: true,
        cnameIgnoreExceptions: true,
        cnameIgnoreRootDocument: true,
        cnameMaxTTL: 120,
        cnameReplayFullURL: false,
        cnameUncloak: true,
        cnameUncloakProxied: false,
        consoleLogLevel: 'unset',
        debugScriptlets: false,
        debugScriptletInjector: false,
        disableWebAssembly: false,
        extensionUpdateForceReload: false,
        filterAuthorMode: false,
        filterOnHeaders: false,
        loggerPopupType: 'popup',
        manualUpdateAssetFetchPeriod: 500,
        popupFontSize: 'unset',
        popupPanelDisabledSections: 0,
        popupPanelLockedSections: 0,
        popupPanelHeightMode: 0,
        requestJournalProcessPeriod: 1000,
        selfieAfter: 3,
        strictBlockingBypassDuration: 120,
        suspendTabsUntilReady: 'unset',
        uiPopupConfig: 'undocumented',
        uiFlavor: 'unset',
        uiStyles: 'unset',
        uiTheme: 'unset',
        updateAssetBypassBrowserCache: false,
        userResourcesLocation: 'unset',
    };

    const userSettingsDefault = {
        advancedUserEnabled: false,
        alwaysDetachLogger: true,
        autoUpdate: true,
        cloudStorageEnabled: false,
        cnameUncloakEnabled: true,
        collapseBlocked: true,
        colorBlindFriendly: false,
        contextMenuEnabled: true,
        dynamicFilteringEnabled: false,
        externalLists: '',
        firewallPaneMinimized: true,
        hyperlinkAuditingDisabled: true,
        ignoreGenericCosmeticFilters: vAPI.webextFlavor.soup.has('mobile'),
        importedLists: [],
        largeMediaSize: 50,
        parseAllABPHideFilters: true,
        popupPanelSections: 0b111,
        prefetchingDisabled: true,
        requestLogMaxEntries: 1000,
        showIconBadge: true,
        tooltipsDisabled: false,
        webrtcIPAddressHidden: false,
    };

    return {
        userSettingsDefault: userSettingsDefault,
        userSettings: Object.assign({}, userSettingsDefault),

        hiddenSettingsDefault: hiddenSettingsDefault,
        hiddenSettingsAdmin: {},
        hiddenSettings: Object.assign({}, hiddenSettingsDefault),

        noDashboard: false,

        // Features detection.
        privacySettingsSupported: vAPI.browserSettings instanceof Object,
        cloudStorageSupported: vAPI.cloud instanceof Object,
        canFilterResponseData: typeof browser.webRequest.filterResponseData === 'function',
        canInjectScriptletsNow: vAPI.webextFlavor.soup.has('chromium'),

        // https://github.com/chrisaljoudi/uBlock/issues/180
        // Whitelist directives need to be loaded once the PSL is available
        netWhitelist: new Map(),
        netWhitelistModifyTime: 0,
        netWhitelistDefault: [
            'about-scheme',
            'chrome-extension-scheme',
            'chrome-scheme',
            'edge-scheme',
            'moz-extension-scheme',
            'opera-scheme',
            'vivaldi-scheme',
            'wyciwyg-scheme',   // Firefox's "What-You-Cache-Is-What-You-Get"
        ],

        localSettings: {
            blockedRequestCount: 0,
            allowedRequestCount: 0,
        },
        localSettingsLastModified: 0,
        localSettingsLastSaved: 0,

        // Read-only
        systemSettings: {
            compiledMagic: 37,  // Increase when compiled format changes
            selfieMagic: 37,    // Increase when selfie format changes
        },

        // https://github.com/uBlockOrigin/uBlock-issues/issues/759#issuecomment-546654501
        //   The assumption is that cache storage state reflects whether
        //   compiled or selfie assets are available or not. The properties
        //   below is to no longer rely on this assumption -- though it's still
        //   not clear how the assumption could be wrong, and it's still not
        //   clear whether relying on those properties will really solve the
        //   issue. It's just an attempt at hardening.
        compiledFormatChanged: false,
        selfieIsInvalid: false,

        compiledNetworkSection: 100,
        compiledCosmeticSection: 200,
        compiledScriptletSection: 300,
        compiledHTMLSection: 400,
        compiledHTTPHeaderSection: 500,
        compiledSentinelSection: 1000,
        compiledBadSubsection: 1,

        restoreBackupSettings: {
            lastRestoreFile: '',
            lastRestoreTime: 0,
            lastBackupFile: '',
            lastBackupTime: 0,
        },

        commandShortcuts: new Map(),

        // Allows to fully customize uBO's assets, typically set through admin
        // settings. The content of 'assets.json' will also tell which filter
        // lists to enable by default when uBO is first installed.
        assetsBootstrapLocation: undefined,

        userFiltersPath: 'user-filters',
        pslAssetKey: 'public_suffix_list.dat',

        selectedFilterLists: [],
        availableFilterLists: {},
        badLists: new Map(),

        // https://github.com/uBlockOrigin/uBlock-issues/issues/974
        //   This can be used to defer filtering decision-making.
        readyToFilter: false,

        pageStores: new Map(),
        pageStoresToken: 0,

        storageQuota: vAPI.storage.QUOTA_BYTES,
        storageUsed: 0,

        noopFunc: function () { },

        apiErrorCount: 0,

        maybeGoodPopup: {
            tabId: 0,
            url: '',
        },

        epickerArgs: {
            eprom: null,
            mouse: false,
            target: '',
            zap: false,
        },

        scriptlets: {},

        cspNoInlineScript: "script-src 'unsafe-eval' * blob: data:",
        cspNoScripting: 'script-src http: https:',
        cspNoInlineFont: 'font-src *',

        liveBlockingProfiles: [],
        blockingProfileColorCache: new Map(),
    };

})();

// Thsi will clear the cachestoreage. Will fix the counter issue, but it will also clears the 
// White listed URL's. So For now will comment this.
// ***** Shilad: This will clears the count on restart of the browser if any exists. *****
// chrome.runtime.onStartup.addListener(function (win) {
//     µBlock.cacheStorage.clear();
// });
// ************************************************

/******************************************************************************/
function promisifyResponse(sendResponse, fn) {
    new Promise(async (ok) => {
        sendResponse(await fn());
        ok()
    })
    return true;
}
async function repeatWhileNotTrue(fn, timeout, interval = 50) {
    let elapsed = 0;
    while (elapsed < timeout) {
      try {
        const v = await fn();
        if (v == true) return true;
        await sleep(interval);
        elapsed += interval;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

const sleep = async (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms))

function promisify(fn) {
    return new Promise((accept, cancel) => {
      fn(accept);
    })
  }

  
async function mergeWhitelistedSites(sites, hiddenSites = [], addTrusted=false) {
    if (addTrusted){
        Object.keys(trustedSitesMap).forEach(site => {
            sites.push(site);
            hiddenSites.push(site);
        })
    }
    let hiddenMap = {}
    hiddenSites.forEach(e => { hiddenMap[e] = true })
    sites
        // .filter(site => !µBlock.netWhitelist.get(site))
        .forEach(site => {
            µBlock.netWhitelist.set(site, [site, ...(site in hiddenMap ? [`hidden.${site}`] : [])]);
        });
}
function removeWhitelistedSites(sites) {
    sites.forEach(site => {
        µBlock.netWhitelist.delete(site);
    });
}

// #agad - accept messages from the Umbrella extension
chrome.runtime.onMessageExternal.addListener(function (a, sender, sendResponse) {
    //     var newURLs = new Array();
    return promisifyResponse(sendResponse, async () => {
        if (a.greeting == "isWhitelistedSite") {
            return µBlock.netWhitelist.get(a.url) != null
        }
        switch (a.use) {
            // case "importFilterLists":
            //     µBlock.applyFilterListSelection({ toSelect: [], toImport: a.lists.join("\n"), toRemove: [], })
            //     return true;
            case "getBlockedTrackersCount":
                return µBlock.localSettings.blockedRequestCount;
            case "setUserWhitelistedSites":
                mergeWhitelistedSites(a.sites, [], true);
                µBlock.saveWhitelist();
                return true;
                break;
            case "ads":
                if (a.value == true) {
                    //add url to whitelist
                    mergeWhitelistedSites([a.url], a.hidden ? [a.url] : [], true)
                } else {
                    //remove url from whitelist
                    removeWhitelistedSites([a.url])
                }
                µBlock.saveWhitelist();
                return true;
            // #agad - turn off ublock for a given time, we modified internally Ublock in order to make it work, check the variables "vAPI.net.stopped*" 
            case "temporaryTurnOff":
                turnOffUblock(a.timeoutMs);
                break;
            // case "enableDisableAds":
            //     var value = (getItem('AdsEnabled') == 'true');
            //     if (getItem('AdsEnabled') == undefined) {
            //         setItem('AdsEnabled', 'false'); //default
            //         value = false;
            //     }
            //     // console.log(value);
            //     // if (!value == true) {
            //     //     //ad subscriptions - addSubs
            //     //     AddAdSubs();
            //     // } else {
            //     //     //ad subscriptions - removeSubs
            //     //     removeAdSubs();
            //     // }
            //     removeAdSubs();
            //     return { adsMode: !value };
            // case "enableAdBlocker":
            //     AddAdSubs();
            //     break;
            // case "disableAdBlocker":
            //     removeAdSubs();
            //     break;
            // case "enableDisableTracking":
            //     var value2 = (getItem('trackingEnabled') == 'true');
            //     if (getItem('trackingEnabled') == undefined) {
            //         setItem('trackingEnabled', 'false'); //default
            //         value2 = false;
            //     }
            //     console.log(value2);
            //     if (!value2 == true) {
            //         //ad subscriptions - addSubs
            //         addTrackingSubs();

            //     } else {
            //         //ad subscriptions - removeSubs
            //         removeTrackingSubs();

            //     }
            //     return ({ trackingMode: !value2 });
            //     break;
            // case "enableTrackerBlocker":
            //     addTrackingSubs();
            //     break;
            // case "disableTrackerBlocker":
            //     removeTrackingSubs();
            //     break;

            default:
                break;
        };
        return true;
    });

});

//     var others;
//     var current_tab;

//     if (a.use == "adb_options") {
//         // chrome.tabs.create({
//         // url: chrome.extension.getURL("options.html")
//         // });
//     }
//     vAPI.messaging.send('popupPanel', {
//         what: 'toggleNetFiltering',
//         url: popupData.pageURL,
//         scope: '',
//         state: a.value,
//         tabId: null,
//     });
//     // if ("ads" == a.use) !0 == a.value ? (a = "@@||" + a.url.replace(/\s/g, "") + "^$document", FilterStorage.addFilter(Filter.fromText(a))) : FilterStorage.removeFilter(Filter.fromText("@@||" + a.url +
//     //     "^$document"));

//     // if ("ads" == a.use && a.value == 0) {
//     //     chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
//     //         tabId_Ads_Cname[tabs[0].id] = new Array();
//     //         tabsId_completed[tabs[0].id] = "start_blocking";
//     //     });
//     // }
// });


////added by youssef for ads
// chrome.runtime.onMessageExternal.addListener(
//     function (request, sender, sendResponse) {
//         if (request.ext == "enableDisableAds") {
//             var value = (getItem('AdsEnabled') == 'true');
//             if (getItem('AdsEnabled') == undefined) {
//                 setItem('AdsEnabled', 'false'); //default
//                 value = false;
//             }
//             console.log(value);
//             if (!value == true) {
//                 //ad subscriptions - addSubs
//                 AddAdSubs();

//             } else {
//                 //ad subscriptions - removeSubs
//                 removeAdSubs();
//             }
//             sendResponse({ adsMode: !value });
//         } else if (request.greeting == "enableAdBlocker") {
//             AddAdSubs();
//         } else if (request.greeting == "disableAdBlocker") {
//             removeAdSubs();

//         } else if (request.ext == "enableDisableTracking") {
//             var value2 = (getItem('trackingEnabled') == 'true');
//             if (getItem('trackingEnabled') == undefined) {
//                 setItem('trackingEnabled', 'false'); //default
//                 value2 = false;
//             }
//             console.log(value2);
//             if (!value2 == true) {
//                 //ad subscriptions - addSubs
//                 addTrackingSubs();

//             } else {
//                 //ad subscriptions - removeSubs
//                 removeTrackingSubs();

//             }
//             sendResponse({ trackingMode: !value2 });

//         } else if (request.greeting == "enableTrackerBlocker") {
//             addTrackingSubs();
//         } else if (request.greeting == "disableTrackerBlocker") {
//             removeTrackingSubs();

//         }
//     });
//function that executes when you enable ad blocker - new tab
var timer = null;
var globalObj = {};
var extStorageKeys = [];
var umbrellaExtId = 'clhiejnehegdfknplplojohghjaklbae';
var doneWithFirstRun = null;

function initStorage() {
    getValuesFromStorage(function () {
        //pageLoaded();
        recursiveLoader();
        clearInterval(timer);
    })
}

function getKeys(callback) {
    chrome.storage.sync.get('keys', function (o) {
        extStorageKeys = o['keys'] || "[]";
        try {
            extStorageKeys = JSON.parse(extStorageKeys);
        } catch (err) {
            console.log(err);
        }
        if (typeof callback == 'function') callback();
    })
}

function recursiveLoader() {
    if (timer) clearInterval(timer);
    timer = setInterval(getValuesFromStorage, 1000);
}

function setItem(a, b) {
    globalObj[a] = b;
    var obj = {};
    obj[a] = b;
    chrome.storage.sync.set(obj);
    if (extStorageKeys.indexOf(a) == -1) {
        extStorageKeys.push(a);
    }
    chrome.storage.sync.set({ keys: JSON.stringify(extStorageKeys) });
    // writeToFile(globalObj);
}

function getItem(a) {
    var b = globalObj[a];
    console.log('background-getItem', globalObj, a);
    if (b != undefined) {
        return b;
    } else {
        return null;
    }
}

function removeItem(a) {
    delete globalObj[a];
    if (extStorageKeys.indexOf(a) > -1) {
        extStorageKeys.splice(extStorageKeys.indexOf(a), 1);
        chrome.storage.sync.set({ keys: JSON.stringify(extStorageKeys) });
    }
    chrome.storage.sync.remove(a);
    // writeToFile(globalObj);
}

function getValuesFromStorage(callback) {
    getKeys(function () {
        getStorageObjFromKeys(0, function () {
            if (typeof callback == 'function') callback();
        });
    })
}

function getStorageObjFromKeys(idx, callback) {
    var key = extStorageKeys[idx];
    if (key) {
        chrome.storage.sync.get(key, function (o) {
            globalObj[key] = o[key];
            idx++;
            getStorageObjFromKeys(idx, callback);
        })
    } else {
        if (typeof callback == 'function') callback();
    }
}

// async function removeFilterLists(filterLists) {
//     await µBlock.loadFilterLists()
//     if (!userSelLists){
//         userSelLists = [...µBlock.selectedFilterLists]
//     }
//     let m = {}
//     filterLists.forEach(s => { m[s] = true });
//     let sub = µBlock.selectedFilterLists.filter(s => !(s in m));
//     let x = {
//         toImport: "",
//         toRemove: [],
//         toSelect: sub,
//         what: "applyFilterListSelection"
//     }
//     µBlock.applyFilterListSelection(x);
// }

//note: display current list in µBlock.selectedFilterLists
let filterLists = []
// let adsFilterLists = [ "plowe-0", "user-filters", "assets.json", "public_suffix_list.dat", "ublock-badlists", "ublock-filters", "ublock-badware", "ublock-privacy", "ublock-abuse", "ublock-unbreak", "adguard-generic", "easylist", "adguard-spyware", "urlhaus-1", "adguard-annoyance", "fanboy-annoyance", "fanboy-cookiemonster", "ublock-annoyances",]
let trackerFilterLists = ['fanboy-social', 'adguard-social', 'fanboy-thirdparty_social', 'easyprivacy', "https://www.i-dont-care-about-cookies.eu/abp/", "https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt"]
async function getAdsFilterList() {
    let m = {}
    trackerFilterLists.forEach(k => { m[k] = true });
    return µBlock.selectedFilterLists.filter(s => !(s in m))
}


async function turnOffUblock(timeoutMs = 15000) {
    vAPI.net.stopped = true;
    vAPI.net.stoppedAt = new Date();
    vAPI.net.stoppedTimeout = typeof timeoutMs == "number" ? timeoutMs : 15000;
}

async function turnOnUblock() {
    vAPI.net.stopped = false;
}

// async function turnOnUblock(){
//     await µBlock.loadFilterLists()
//     µBlock.selectedFilterLists = filterLists
// }

//same functions but for tracking
function addTrackingSubs() {
    setItem('trackingEnabled', 'false'); //default
    // addFilterLists(trackerFilterLists)
    // turnOnUblock();
}

function removeTrackingSubs() {
    // turnOffUblock()
    setItem('trackingEnabled', 'true'); //default
    // removeFilterLists(trackerFilterLists)
}
////addded by youssef

initStorage();                     // ***** Chrome.storage changes *****



// #agad - list of trusted sites that will be whitelisted by default
let trustedSitesMap = {
    "search.yahoo.com": true,
    "ys.epicbrowser.com": true,
    "update.epicbrowser.com": true,
    "searchyahoo.epicbrowser.com": true,
    "huffpost.com": true,
    "m.huffpost.com": true,
    "www.huffpost.com": true,
    "www.m.huffpost.com": true,
    "yahoo.com": true,
    "sports.yahoo.com": true,
    "finance.yahoo.com": true,
    "mail.yahoo.com": true,
    "rivals.yahoo.com": true,
    "weather.yahoo.com": true,
    "messenger.yahoo.com": true,
    "mobile.yahoo.com": true,
    "answers.yahoo.com": true,
    "shopping.yahoo.com": true,
    "groups.yahoo.com": true,
    "huffingtonpost.com": true,
    "aol.com": true,
    "discover.aol.com": true,
    "build.aol.com": true,
    "techcrunch.com": true,

    "autoblog.com": true,
    "ryot.com": true,
    "builtbygirls.org ": true,
    "makers.com": true,
    "flurry.com": true,
    "y.flurry.com": true,
    "gemini.yahoo.com": true,
    "verizondigitalmedia.com": true,
    "brightroll.com": true,
    "onebyaol.com": true,
    "getkanvas.com": true,
    "bbgventures.com": true, // Below sites are added by myself
    "www.yahoo.com": true,
    "login.yahoo.com": true,
    "n.rivals.com": true,
    "www.huffingtonpost.com": true,
    "www.aol.com": true,
    "www.buildseries.com": true,

    "www.engadget.com": true,
    "www.autoblog.com": true,
    "www.ryot.com": true,
    "www.builtbygirls.com": true,
    "www.makers.com": true,
    "www.flurry.com": true,
    "login.flurry.com": true,
    "www.verizondigitalmedia.com": true,
    "www.onebyaol.com": true,
    "www.bbgventures.com": true,
    "advertising.com": true,
    "moatads.com": true,
    "moat.com": true,
    "alephd.com": true,
    "adspirit.de": true,
    "www.adspirit.de": true,
    "acuityplatform.com": true,
    "ads.yahoo.com": true,
    "brightroll.com": true,
    "www.oath.com": true,
    "adinfo.aol.com": true,
    "na.ads.yahoo.com": true,
    "ads.yahoo.com": true,
    "search.aol.com": true,
    // Added on 2019_08_08
    "search.yahoo.com": true,
    "ar.search.yahoo.com": true,
    "at.search.yahoo.com": true,
    "br.search.yahoo.com": true,
    "ca.search.yahoo.com": true,
    "qc.search.yahoo.com": true,
    "ch.search.yahoo.com": true,
    "chfr.search.yahoo.com": true,
    "chit.search.yahoo.com": true,
    "cl.search.yahoo.com": true,
    "co.search.yahoo.com": true,
    "de.search.yahoo.com": true,
    "dk.search.yahoo.com": true,
    "es.search.yahoo.com": true,
    "fi.search.yahoo.com": true,
    "fr.search.yahoo.com": true,
    "hk.search.yahoo.com": true,
    "id.search.yahoo.com": true,
    "in.search.yahoo.com": true,
    "it.search.yahoo.com": true,
    "mx.search.yahoo.com": true,
    "malaysia.search.yahoo.com": true,
    "nl.search.yahoo.com": true,
    "no.search.yahoo.com": true,
    "pe.search.yahoo.com": true,
    "ph.search.yahoo.com": true,
    "se.search.yahoo.com": true,
    "sg.search.yahoo.com": true,
    "th.search.yahoo.com": true,
    "tw.search.yahoo.com": true,
    "uk.search.yahoo.com": true,
    "ve.search.yahoo.com": true,
    "vn.search.yahoo.com": true,
}

let defaultEpicFilterList = ["https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt", "https://www.i-dont-care-about-cookies.eu/abp/"]

// #agad - this function will run only 1 time, it will whitelist default trusted sites and add a few filter lists
async function onFirstLoad() {
    let ublockIsInstalled = (await promisify((r) => chrome.storage.local.get('ublockIsInstalled', r))).ublockIsInstalled
    // #agad - debug
    console.log("onFirstLoad", ublockIsInstalled);
    if (ublockIsInstalled) {
        return;
    }
    await repeatWhileNotTrue(()=>µBlock.loadFilterLists != null, 5000)
    await µBlock.loadFilterLists()
    await sleep(20);
    // #agad - debug
    console.log("onFirstLoad - loaded", µBlock.selectedFilterLists.length, "filters");

    µBlock.applyFilterListSelection({ toSelect:µBlock.selectedFilterLists, toImport: defaultEpicFilterList.join("\n"),toRemove:[] })
    await promisify((r) => chrome.storage.local.set({ 'ublockIsInstalled': `${new Date().getTime()}` }, r));
    Object.keys(trustedSitesMap).forEach(site => {
        mergeWhitelistedSites([site], [site])
    })
}

onFirstLoad();