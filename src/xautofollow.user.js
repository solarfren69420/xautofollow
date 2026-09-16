// ==UserScript==
// @name         SolarFren X AutoFollower
// @namespace    https://github.com/solarfren69420
// @version      1.0.0
// @description  Smart AutoFollower for founder, builder, indie hacker and networking posts on X.
// @author       SolarFren
// @license      MIT
// @homepageURL  https://github.com/solarfren69420/xautofollow
// @supportURL   https://github.com/solarfren69420/xautofollow/issues
// @downloadURL  https://raw.githubusercontent.com/solarfren69420/xautofollow/main/dist/xautofollow.user.js
// @updateURL    https://raw.githubusercontent.com/solarfren69420/xautofollow/main/dist/xautofollow.user.js
// @match        https://x.com/*
// @match        https://twitter.com/*
// @exclude      https://x.com/i/chat*
// @exclude      https://twitter.com/i/chat*
// @exclude      https://x.com/messages*
// @exclude      https://twitter.com/messages*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /******************************************************************
     * SOLARFREN X AUTOFOLLOWER
     * v1.0.0
     ******************************************************************/

    const VERSION = '1.0.0';

    /******************************************************************
     * CONFIGURATION
     ******************************************************************/

    // Minimum score required for a post to qualify.
    const MIN_SCORE = 3;

    // Delay after an actual follow action.
    const MIN_FOLLOW_DELAY = 750;
    const MAX_FOLLOW_DELAY = 1400;

    // Delay between queue jobs.
    const CHECK_DELAY = 150;

    // Local safety limit.
    // X may enforce its own limits independently of this.
    const MAX_FOLLOWS_PER_HOUR = 40;

    // Ignore promoted posts.
    const SKIP_PROMOTED = true;

    // How often the backup scanner runs.
    const SCAN_INTERVAL = 650;

    /******************************************************************
     * STATE
     ******************************************************************/

    let enabled = true;
    let workerRunning = false;
    let ownHandle = null;
    let previousURL = location.href;

    let panelLastMessage = 'INITIALISING';

    const queue = [];

    const queuedKeys = new Set();
    const finishedKeys = new Set();

    // Accounts actually followed by this script this page/session.
    const followedThisSession = new Set();

    // Accounts discovered to already be followed.
    const alreadyFollowing = new Set();

    // All handles we know don't need another follow attempt.
    const knownFollowing = new Set();

    const followTimes = [];

    /******************************************************************
     * UTILITIES
     ******************************************************************/

    const sleep = ms =>
        new Promise(resolve => setTimeout(resolve, ms));

    const rand = (min, max) =>
        Math.floor(min + Math.random() * (max - min + 1));

    function escapeHTML(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function escapeRegExp(value) {
        return value.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
        );
    }

    /******************************************************************
     * ROUTE SAFETY
     ******************************************************************/

    function isBlockedRoute() {
        const path = location.pathname.toLowerCase();

        return (
            path.startsWith('/i/chat') ||
            path.startsWith('/messages')
        );
    }

    /******************************************************************
     * AUTOMATIC LOGGED-IN USER DETECTION
     ******************************************************************/

    function detectOwnHandle() {

        // Most reliable desktop X source.
        const profileLink =
            document.querySelector(
                'a[data-testid="AppTabBar_Profile_Link"]'
            );

        if (profileLink) {
            const href =
                profileLink.getAttribute('href') || '';

            const match =
                href.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);

            if (match) {
                ownHandle =
                    match[1].toLowerCase();

                return ownHandle;
            }
        }

        // Fallback: account switcher text often contains @username.
        const accountSwitcher =
            document.querySelector(
                '[data-testid="SideNav_AccountSwitcher_Button"]'
            );

        if (accountSwitcher) {

            const text =
                accountSwitcher.innerText || '';

            const match =
                text.match(/@([A-Za-z0-9_]{1,15})\b/);

            if (match) {
                ownHandle =
                    match[1].toLowerCase();

                return ownHandle;
            }

            // Alternate fallback through any links inside it.
            for (
                const link of
                accountSwitcher.querySelectorAll('a[href^="/"]')
            ) {
                const href =
                    link.getAttribute('href') || '';

                const hrefMatch =
                    href.match(
                        /^\/([A-Za-z0-9_]{1,15})\/?$/
                    );

                if (hrefMatch) {
                    ownHandle =
                        hrefMatch[1].toLowerCase();

                    return ownHandle;
                }
            }
        }

        return ownHandle;
    }

    function isOwnHandle(handle) {
        if (!handle)
            return false;

        if (!ownHandle)
            detectOwnHandle();

        return (
            ownHandle &&
            handle.toLowerCase() === ownHandle
        );
    }

    /******************************************************************
     * MATCHING ENGINE
     ******************************************************************/

    function scorePost(text) {
        if (!text)
            return 0;

        const t = text.trim();

        let score = 0;

        /**************************************************************
         * SHORT NETWORKING REPLIES
         **************************************************************/

        // Let's connect
        // Lets connect!
        // Sure, let's connect
        if (
            /^(?:sure[,.! ]*)?(?:let['’]?s|lets)\s+connect[.!…🤝🙂😊🔥🚀]*$/iu
                .test(t)
        ) {
            score += 6;
        }

        if (
            /^would\s+love\s+to\s+connect[.!…🤝🙂😊🔥🚀]*$/iu
                .test(t)
        ) {
            score += 6;
        }

        if (
            /^happy\s+to\s+connect[.!…🤝🙂😊🔥🚀]*$/iu
                .test(t)
        ) {
            score += 5;
        }

        if (
            /^let['’]?s\s+(?:chat|talk|network)[.!…🤝🙂😊🔥🚀]*$/iu
                .test(t)
        ) {
            score += 4;
        }

        /**************************************************************
         * AGE / PERSONAL INTRO
         **************************************************************/

        // I'm 24 / I'm 35
        if (
            /\bi['’]?m\s+(?:1[89]|[2-9]\d)\b/i
                .test(t)
        ) {
            score += 3;
        }

        // I am 31
        if (
            /\bi\s+am\s+(?:1[89]|[2-9]\d)\b/i
                .test(t)
        ) {
            score += 3;
        }

        // Hi I'm Kate / Hello, I am John
        if (
            /\b(?:hi|hey|hello)[!,. ]{0,6}(?:i['’]?m|i\s+am)\b/i
                .test(t)
        ) {
            score += 3;
        }

        /**************************************************************
         * NETWORKING INTENT
         **************************************************************/

        if (
            /\blooking\s+to\s+connect\b/i
                .test(t)
        ) {
            score += 4;
        }

        if (
            /\bhappy\s+to\s+connect\b/i
                .test(t)
        ) {
            score += 3;
        }

        if (
            /\bwould\s+love\s+to\s+connect\b/i
                .test(t)
        ) {
            score += 3;
        }

        if (
            /\bopen\s+to\s+connect(?:ing)?\b/i
                .test(t)
        ) {
            score += 2;
        }

        if (
            /\bconnect\s+with\s+(?:more|other|fellow)\b/i
                .test(t)
        ) {
            score += 2;
        }

        if (
            /\blet['’]?s\s+connect\b/i
                .test(t)
        ) {
            score += 3;
        }

        if (
            /\blet['’]?s\s+(?:network|build|create)\b/i
                .test(t)
        ) {
            score += 2;
        }

        if (
            /\bmeet\s+(?:more|other|fellow)\b/i
                .test(t)
        ) {
            score += 2;
        }

        /**************************************************************
         * FOUNDER / BUILDER / INDIE HACKER SIGNALS
         **************************************************************/

        if (
            /\bsolo\s*(?:founder|preneur)\b/i
                .test(t)
        ) {
            score += 3;
        }

        if (
            /\bco[- ]?founder\b/i
                .test(t)
        ) {
            score += 2;
        }

        if (
            /\bfounders?\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bindie\s*hackers?\b/i
                .test(t)
        ) {
            score += 2;
        }

        if (
            /\bsolopreneurs?\b/i
                .test(t)
        ) {
            score += 2;
        }

        if (
            /\bentrepreneurs?\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bbuilders?\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bbuilding\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bstartups?\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bbootstrapp(?:ed|er|ing)\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bSaaS\b/i
                .test(t)
        ) {
            score += 1;
        }

        /**************************************************************
         * PROFESSIONAL BIO SIGNALS
         **************************************************************/

        if (
            /\bproduct\s+designers?\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bdesigners?\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bdevelopers?\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bengineers?\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bprogrammers?\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bmarketers?\b|\bmarketing\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bgrowth\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bbusiness\s+development\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bAI\s+(?:enthusiast|builder|founder|engineer|developer|explorer)s?\b/i
                .test(t)
        ) {
            score += 1;
        }

        /**************************************************************
         * LOCATION / BIO-LIKE LANGUAGE
         **************************************************************/

        if (
            /\bliving\s+in\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\bbased\s+in\b/i
                .test(t)
        ) {
            score += 1;
        }

        if (
            /\btravell?ing\b/i
                .test(t)
        ) {
            score += 1;
        }

        return score;
    }

    function isTargetPost(text) {
        return scorePost(text) >= MIN_SCORE;
    }

    /******************************************************************
     * POST DATA
     ******************************************************************/

    function getTweetText(tweet) {
        return (
            tweet
                .querySelector(
                    '[data-testid="tweetText"]'
                )
                ?.innerText
                ?.trim() ||
            ''
        );
    }

    function getHandle(tweet) {
        const userBlock =
            tweet.querySelector(
                '[data-testid="User-Name"]'
            );

        if (!userBlock)
            return null;

        for (
            const link of
            userBlock.querySelectorAll('a[href^="/"]')
        ) {
            const href =
                link.getAttribute('href') || '';

            const match =
                href.match(
                    /^\/([A-Za-z0-9_]{1,15})$/
                );

            if (match)
                return match[1];
        }

        return null;
    }

    function getTweetID(tweet) {
        for (
            const link of
            tweet.querySelectorAll(
                'a[href*="/status/"]'
            )
        ) {
            const href =
                link.getAttribute('href') || '';

            const match =
                href.match(
                    /\/status\/(\d+)/
                );

            if (match)
                return match[1];
        }

        return null;
    }

    function getTweetKey(tweet) {
        const id =
            getTweetID(tweet);

        if (id)
            return `tweet:${id}`;

        const handle =
            getHandle(tweet) || '?';

        const text =
            getTweetText(tweet);

        return (
            `${handle}:` +
            text.substring(0, 220)
        );
    }

    function isPromoted(tweet) {
        return /\bPromoted\b/i.test(
            tweet.innerText || ''
        );
    }

    /******************************************************************
     * RATE LIMIT
     ******************************************************************/

    function cleanFollowTimes() {
        const cutoff =
            Date.now() -
            (60 * 60 * 1000);

        while (
            followTimes.length &&
            followTimes[0] < cutoff
        ) {
            followTimes.shift();
        }
    }

    function rateLimitReached() {
        cleanFollowTimes();

        return (
            followTimes.length >=
            MAX_FOLLOWS_PER_HOUR
        );
    }

    /******************************************************************
     * X MENU HANDLING
     ******************************************************************/

    async function waitForMenu(timeout = 2000) {
        const start =
            Date.now();

        while (
            Date.now() - start < timeout
        ) {
            if (isBlockedRoute())
                return null;

            const menus =
                [
                    ...document.querySelectorAll(
                        '[role="menu"]'
                    )
                ];

            if (menus.length)
                return menus[menus.length - 1];

            await sleep(40);
        }

        return null;
    }

    async function closeMenu() {
        document.dispatchEvent(
            new KeyboardEvent(
                'keydown',
                {
                    key: 'Escape',
                    code: 'Escape',
                    bubbles: true
                }
            )
        );

        await sleep(90);
    }

    async function openTweetMenu(tweet) {
        const caret =
            tweet.querySelector(
                '[data-testid="caret"]'
            );

        if (!caret)
            return null;

        // X sometimes ignores a click while React is rendering,
        // therefore retry a few times.
        for (
            let attempt = 0;
            attempt < 3;
            attempt++
        ) {
            if (
                isBlockedRoute() ||
                !enabled
            ) {
                return null;
            }

            caret.click();

            const menu =
                await waitForMenu(1300);

            if (menu)
                return menu;

            await sleep(180);
        }

        return null;
    }

    function findFollowMenuItem(
        menu,
        handle
    ) {
        const items =
            [
                ...menu.querySelectorAll(
                    '[role="menuitem"]'
                )
            ];

        // Prefer exact handle if X displays:
        // Follow @somebody
        const exact =
            items.find(item => {
                const text =
                    (item.innerText || '')
                        .trim();

                return new RegExp(
                    `^Follow\\s+@?${escapeRegExp(handle)}\\b`,
                    'i'
                ).test(text);
            });

        if (exact)
            return exact;

        // Fallback for UI variants that simply say "Follow".
        return items.find(item => {
            const text =
                (item.innerText || '')
                    .trim();

            return (
                /^Follow\b/i.test(text) &&
                !/^Following\b/i.test(text) &&
                !/^Unfollow\b/i.test(text)
            );
        });
    }

    /******************************************************************
     * PROCESS ONE MATCHED POST
     ******************************************************************/

    async function processTweet(
        tweet,
        key
    ) {
        if (
            isBlockedRoute() ||
            !enabled
        ) {
            return false;
        }

        if (!document.contains(tweet))
            return false;

        const text =
            getTweetText(tweet);

        const handle =
            getHandle(tweet);

        if (
            !text ||
            !handle
        ) {
            return false;
        }

        const lowerHandle =
            handle.toLowerCase();

        // Never process the currently logged-in user's own posts.
        if (isOwnHandle(handle)) {
            finishedKeys.add(key);
            return true;
        }

        if (
            SKIP_PROMOTED &&
            isPromoted(tweet)
        ) {
            finishedKeys.add(key);
            return true;
        }

        const score =
            scorePost(text);

        if (
            score < MIN_SCORE
        ) {
            finishedKeys.add(key);
            return true;
        }

        if (
            knownFollowing.has(
                lowerHandle
            )
        ) {
            finishedKeys.add(key);
            return true;
        }

        console.log(
            `[SolarFren] MATCH score=${score} @${handle}`,
            text
        );

        updatePanel(
            `MATCH @${handle} • SCORE ${score}`
        );

        const menu =
            await openTweetMenu(tweet);

        // Do NOT permanently discard the post when X's menu
        // fails to load. A future scan may retry it.
        if (!menu) {
            console.warn(
                `[SolarFren] Menu failed for @${handle}; will retry.`
            );

            return false;
        }

        const followItem =
            findFollowMenuItem(
                menu,
                handle
            );

        if (!followItem) {
            // Most commonly means that this account is already
            // followed and X has an "Unfollow" menu item instead.

            await closeMenu();

            alreadyFollowing.add(
                lowerHandle
            );

            knownFollowing.add(
                lowerHandle
            );

            finishedKeys.add(key);

            updatePanel(
                `ALREADY FOLLOWING @${handle}`
            );

            return true;
        }

        if (rateLimitReached()) {
            await closeMenu();

            updatePanel(
                'HOURLY CAP REACHED'
            );

            return false;
        }

        // Final protection immediately before clicking Follow.
        if (
            isBlockedRoute() ||
            !enabled
        ) {
            await closeMenu();
            return false;
        }

        console.log(
            `%c[SolarFren] FOLLOWING @${handle}`,
            'font-weight:bold;color:#00e676'
        );

        followItem.click();

        followedThisSession.add(
            lowerHandle
        );

        knownFollowing.add(
            lowerHandle
        );

        followTimes.push(
            Date.now()
        );

        finishedKeys.add(key);

        updatePanel(
            `✓ FOLLOWED @${handle}`
        );

        await sleep(
            rand(
                MIN_FOLLOW_DELAY,
                MAX_FOLLOW_DELAY
            )
        );

        return true;
    }

    /******************************************************************
     * QUEUE
     ******************************************************************/

    function enqueueTweet(tweet) {
        if (
            !enabled ||
            isBlockedRoute()
        ) {
            return;
        }

        const key =
            getTweetKey(tweet);

        if (
            queuedKeys.has(key) ||
            finishedKeys.has(key)
        ) {
            return;
        }

        const text =
            getTweetText(tweet);

        if (!text)
            return;

        if (!isTargetPost(text))
            return;

        const handle =
            getHandle(tweet);

        if (
            handle &&
            isOwnHandle(handle)
        ) {
            finishedKeys.add(key);
            return;
        }

        if (
            handle &&
            knownFollowing.has(
                handle.toLowerCase()
            )
        ) {
            finishedKeys.add(key);
            return;
        }

        if (
            SKIP_PROMOTED &&
            isPromoted(tweet)
        ) {
            finishedKeys.add(key);
            return;
        }

        queuedKeys.add(key);

        queue.push({
            tweet,
            key
        });

        updatePanel();

        runWorker();
    }

    async function runWorker() {
        if (
            workerRunning ||
            !enabled ||
            isBlockedRoute()
        ) {
            return;
        }

        workerRunning = true;

        while (
            queue.length &&
            enabled &&
            !isBlockedRoute()
        ) {
            if (rateLimitReached()) {
                updatePanel(
                    'HOURLY CAP REACHED'
                );

                break;
            }

            const job =
                queue.shift();

            queuedKeys.delete(
                job.key
            );

            try {
                const success =
                    await processTweet(
                        job.tweet,
                        job.key
                    );

                if (!success)
                    await sleep(350);

            } catch (error) {
                console.error(
                    '[SolarFren] Worker error:',
                    error
                );

                try {
                    await closeMenu();
                } catch (_) {}
            }

            await sleep(
                CHECK_DELAY
            );
        }

        workerRunning = false;

        updatePanel();
    }

    /******************************************************************
     * SCANNING
     ******************************************************************/

    function scanPage() {
        if (isBlockedRoute()) {
            updatePanel(
                'AUTOFOLLOW DISABLED ON X CHAT'
            );

            return;
        }

        if (!enabled)
            return;

        // Re-attempt account detection if it wasn't available
        // during initial page startup.
        if (!ownHandle)
            detectOwnHandle();

        document
            .querySelectorAll(
                'article[data-testid="tweet"]'
            )
            .forEach(enqueueTweet);
    }

    let mutationScanTimer = null;

    const observer =
        new MutationObserver(() => {

            if (
                !enabled ||
                isBlockedRoute()
            ) {
                return;
            }

            clearTimeout(
                mutationScanTimer
            );

            mutationScanTimer =
                setTimeout(
                    scanPage,
                    70
                );
        });

    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );

    /******************************************************************
     * SOLARFREN CONTROL PANEL
     ******************************************************************/

    const panel =
        document.createElement('div');

    panel.id =
        'solarfren-x-autofollower';

    Object.assign(
        panel.style,
        {
            position: 'fixed',
            right: '18px',
            bottom: '18px',
            width: '300px',
            zIndex: '2147483647',

            background:
                'linear-gradient(145deg,#05080c,#0d1219)',

            color: '#e7e9ea',

            border:
                '1px solid rgba(29,155,240,.55)',

            borderRadius: '18px',

            fontFamily:
                '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif',

            boxShadow:
                '0 15px 50px rgba(0,0,0,.62),' +
                '0 0 28px rgba(29,155,240,.11)',

            overflow: 'hidden',
            userSelect: 'none'
        }
    );

    function statBox(
        value,
        label
    ) {
        return `
            <div style="
                padding:10px 3px;
                background:rgba(255,255,255,.035);
                border:1px solid rgba(255,255,255,.06);
                border-radius:11px;
                text-align:center;
            ">
                <div style="
                    font-size:17px;
                    line-height:19px;
                    font-weight:850;
                    color:#fff;
                ">
                    ${value}
                </div>

                <div style="
                    margin-top:4px;
                    font-size:7.5px;
                    color:#71767b;
                    letter-spacing:.65px;
                ">
                    ${label}
                </div>
            </div>
        `;
    }

    function updatePanel(
        message = ''
    ) {
        if (message)
            panelLastMessage =
                message;

        cleanFollowTimes();

        const blocked =
            isBlockedRoute();

        const active =
            enabled &&
            !blocked;

        const statusColor =
            blocked
                ? '#ffb300'
                : active
                    ? '#00e676'
                    : '#ff5252';

        const statusText =
            blocked
                ? 'BLOCKED'
                : active
                    ? 'ACTIVE'
                    : 'PAUSED';

        const hourlyPercent =
            Math.min(
                100,
                (
                    followTimes.length /
                    MAX_FOLLOWS_PER_HOUR
                ) * 100
            );

        const accountText =
            ownHandle
                ? `@${ownHandle}`
                : 'detecting account…';

        panel.innerHTML = `

            <div style="
                padding:14px 16px 12px;
                background:
                    linear-gradient(
                        90deg,
                        rgba(29,155,240,.15),
                        transparent
                    );
                border-bottom:
                    1px solid rgba(255,255,255,.07);
            ">

                <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    gap:8px;
                ">

                    <div>
                        <div style="
                            font-size:15px;
                            font-weight:850;
                            color:#fff;
                        ">
                            ☀ SolarFren X AutoFollower
                        </div>

                        <div style="
                            margin-top:3px;
                            font-size:8.5px;
                            letter-spacing:1.15px;
                            color:#71767b;
                        ">
                            NETWORK DISCOVERY ENGINE • v${VERSION}
                        </div>
                    </div>

                    <div style="
                        display:flex;
                        align-items:center;
                        gap:5px;
                        font-size:8.5px;
                        font-weight:850;
                        color:${statusColor};
                    ">
                        <span style="
                            width:8px;
                            height:8px;
                            display:inline-block;
                            border-radius:50%;
                            background:${statusColor};
                            box-shadow:
                                0 0 9px ${statusColor};
                        "></span>

                        ${statusText}
                    </div>

                </div>

            </div>

            <div style="
                padding:13px 15px 14px;
            ">

                <div style="
                    display:grid;
                    grid-template-columns:
                        repeat(4,1fr);
                    gap:6px;
                ">
                    ${statBox(
                        followedThisSession.size,
                        'FOLLOWED'
                    )}

                    ${statBox(
                        alreadyFollowing.size,
                        'ALREADY'
                    )}

                    ${statBox(
                        queue.length,
                        'QUEUE'
                    )}

                    ${statBox(
                        followTimes.length,
                        '1 HOUR'
                    )}
                </div>

                <div style="
                    margin-top:13px;
                ">
                    <div style="
                        display:flex;
                        justify-content:space-between;
                        font-size:8.5px;
                        color:#71767b;
                        margin-bottom:6px;
                    ">
                        <span>
                            HOURLY ACTIVITY
                        </span>

                        <span style="
                            color:#aab8c2;
                        ">
                            ${followTimes.length}
                            /
                            ${MAX_FOLLOWS_PER_HOUR}
                        </span>
                    </div>

                    <div style="
                        height:5px;
                        background:#202327;
                        border-radius:10px;
                        overflow:hidden;
                    ">
                        <div style="
                            width:${hourlyPercent}%;
                            height:100%;
                            background:
                                linear-gradient(
                                    90deg,
                                    #1d9bf0,
                                    #00e676
                                );
                            transition:
                                width .25s ease;
                        "></div>
                    </div>
                </div>

                <div style="
                    margin-top:12px;
                    padding:9px 10px;
                    border-radius:10px;
                    background:
                        rgba(29,155,240,.07);
                    border:
                        1px solid rgba(29,155,240,.12);
                ">

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        margin-bottom:4px;
                    ">
                        <span style="
                            font-size:8px;
                            letter-spacing:.9px;
                            color:#71767b;
                        ">
                            LAST ACTION
                        </span>

                        <span style="
                            font-size:8px;
                            color:#71767b;
                        ">
                            ${escapeHTML(accountText)}
                        </span>
                    </div>

                    <div style="
                        font-size:10.5px;
                        font-weight:750;
                        color:
                            ${blocked
                                ? '#ffb300'
                                : '#1d9bf0'};
                        white-space:nowrap;
                        overflow:hidden;
                        text-overflow:ellipsis;
                    ">
                        ${
                            escapeHTML(
                                blocked
                                    ? 'AUTOFOLLOW DISABLED ON X CHAT'
                                    : panelLastMessage
                            )
                        }
                    </div>

                </div>

                <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-top:11px;
                ">

                    <div style="
                        font-size:8.5px;
                        color:#71767b;
                    ">
                        MATCH SCORE ≥
                        <b style="
                            color:#aab8c2;
                        ">
                            ${MIN_SCORE}
                        </b>
                    </div>

                    <button
                        id="sf-toggle"
                        style="
                            appearance:none;
                            padding:7px 13px;
                            border-radius:20px;
                            cursor:pointer;
                            font-size:8.5px;
                            font-weight:850;

                            background:
                                ${
                                    enabled
                                        ? 'rgba(255,82,82,.11)'
                                        : 'rgba(0,230,118,.11)'
                                };

                            color:
                                ${
                                    enabled
                                        ? '#ff7070'
                                        : '#00e676'
                                };

                            border:
                                1px solid
                                ${
                                    enabled
                                        ? 'rgba(255,82,82,.25)'
                                        : 'rgba(0,230,118,.25)'
                                };
                        "
                    >
                        ${
                            enabled
                                ? 'Ⅱ PAUSE'
                                : '▶ RESUME'
                        }
                    </button>

                </div>

            </div>
        `;
    }

    panel.addEventListener(
        'click',
        event => {

            const button =
                event.target.closest(
                    '#sf-toggle'
                );

            if (!button)
                return;

            enabled =
                !enabled;

            updatePanel(
                enabled
                    ? 'AUTOFOLLOW RESUMED'
                    : 'AUTOFOLLOW PAUSED'
            );

            if (
                enabled &&
                !isBlockedRoute()
            ) {
                scanPage();
                runWorker();
            }
        }
    );

    document.body.appendChild(
        panel
    );

    /******************************************************************
     * SPA ROUTE WATCHER + BACKUP SCANNER
     ******************************************************************/

    setInterval(() => {

        // X is a single-page application, so navigating into chat
        // may not reload the userscript.
        if (
            location.href !==
            previousURL
        ) {
            previousURL =
                location.href;

            if (isBlockedRoute()) {

                queue.length = 0;
                queuedKeys.clear();

                closeMenu()
                    .catch(() => {});

                updatePanel(
                    'AUTOFOLLOW DISABLED ON X CHAT'
                );

            } else {

                updatePanel(
                    'SCANNING'
                );

                setTimeout(
                    scanPage,
                    250
                );
            }
        }

        if (
            enabled &&
            !isBlockedRoute()
        ) {
            scanPage();
        }

    }, SCAN_INTERVAL);

    /******************************************************************
     * START
     ******************************************************************/

    setTimeout(() => {

        detectOwnHandle();

        console.log(
            '[SolarFren] Logged-in account:',
            ownHandle
                ? `@${ownHandle}`
                : 'not yet detected'
        );

        updatePanel(
            isBlockedRoute()
                ? 'AUTOFOLLOW DISABLED ON X CHAT'
                : 'SCANNING'
        );

        if (!isBlockedRoute())
            scanPage();

    }, 450);

    console.log(
        `%c☀ SolarFren X AutoFollower v${VERSION}`,
        'font-size:15px;font-weight:bold;color:#1d9bf0'
    );

})();
