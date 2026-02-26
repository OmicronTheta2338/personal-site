/**
 * router.js — Hash-based SPA routing + link stealth
 *
 * Extracted from the inline <script> in index.html.
 * Manages page-view switching, nav active states, dropdown toggle,
 * and hides browser link previews (status bar URLs).
 */

export function showPage(viewId) {
    var views = document.querySelectorAll('.page-view');
    var found = false;

    views.forEach(function (view) {
        if (view.id === viewId) {
            view.style.display = 'block';
            found = true;
        } else {
            view.style.display = 'none';
        }
    });

    var finalViewId = viewId;
    if (!found && document.getElementById('view-about-me')) {
        document.getElementById('view-about-me').style.display = 'block';
        finalViewId = 'view-about-me';
    }

    document.querySelectorAll('#site-nav .nav-link, #nav-more-options .nav-link').forEach(function (el) {
        if (el.getAttribute('data-view') === finalViewId) {
            el.classList.add('nav-active');
        } else {
            el.classList.remove('nav-active');
        }
    });

    var moreBtn = document.getElementById('nav-more-toggle');
    if (moreBtn) {
        var isMoreActive = !!document.querySelector('#nav-more-options .nav-link.nav-active');
        if (isMoreActive) {
            moreBtn.classList.add('nav-active');
        } else {
            moreBtn.classList.remove('nav-active');
        }
    }

    window.scrollTo(0, 0);
    window.dispatchEvent(new CustomEvent("pageChanged"));
}

export function handleRouting() {
    var hash = window.location.hash || '#about-me';
    showPage('view-' + hash.substring(1));
}

export function initRouter() {
    window.addEventListener('hashchange', function (e) {
        e.preventDefault();
        handleRouting();
    });

    document.querySelectorAll('.nav-link').forEach(function (link) {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            var viewId = this.getAttribute('data-view');
            var hashId = '#' + viewId.substring(5);

            showPage(viewId);
            history.pushState(null, null, hashId);

            var dropdownList = document.getElementById('nav-more-options');
            if (dropdownList && !dropdownList.hidden) {
                dropdownList.hidden = true;
                document.getElementById('nav-more-toggle').setAttribute('aria-expanded', 'false');
            }
        });
    });

    var navDropdownToggle = document.getElementById('nav-more-toggle');
    var navDropdownOptions = document.getElementById('nav-more-options');

    if (navDropdownToggle && navDropdownOptions) {
        navDropdownToggle.addEventListener('click', function (e) {
            e.preventDefault();
            var isHidden = navDropdownOptions.hidden;
            navDropdownOptions.hidden = !isHidden;
            navDropdownToggle.setAttribute('aria-expanded', !isHidden);
        });

        document.addEventListener('click', function (e) {
            if (!navDropdownToggle.contains(e.target) && !navDropdownOptions.contains(e.target)) {
                navDropdownOptions.hidden = true;
                navDropdownToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    handleRouting();

    initLinkStealth();
}

function initLinkStealth() {
    document.querySelectorAll('a[href]').forEach(function (a) {
        var href = a.getAttribute('href');
        var target = a.getAttribute('target');
        var rel = a.getAttribute('rel');

        a.removeAttribute('href');
        a.setAttribute('data-href', href);

        a.style.cursor = 'pointer';
        a.setAttribute('tabindex', '0');

        function navigate(e) {
            e.preventDefault();
            if (target === '_blank') {
                window.open(href, '_blank', rel && rel.indexOf('noopener') !== -1 ? 'noopener' : '');
            } else {
                window.location.href = href;
            }
        }

        a.addEventListener('click', navigate);
        a.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') navigate(e);
        });
    });
}
