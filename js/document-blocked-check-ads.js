
async function getExtensionIdByName(name) {
    return new Promise((ok) => chrome.management.getAll(function (exts) {
        let ext = exts.find(e => e.name == name);
        return ok(ext ? ext.id : null)
    }));
}
const sleep = async (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms))

function promisify(fn) {
    return new Promise((accept, cancel) => {
        fn(accept);
    })
}

async function check() {
    await sleep(300);
    const umbrellaExtId = await getExtensionIdByName("03_Umbrella Button")
    const isSponsoredAds = await promisify(r => chrome.runtime.sendMessage(umbrellaExtId, { ext: "isSponsoredAds" }, r))

    if (!isSponsoredAds) {
        document.body.style.display = "block";
        return;
    }

    let details = {};
    {
        const matches = /details=([^&]+)/.exec(window.location.search);
        if (matches !== null) {
            details = JSON.parse(decodeURIComponent(matches[1]));
        }
    }
    window.location.replace(details.url);
}
check()
