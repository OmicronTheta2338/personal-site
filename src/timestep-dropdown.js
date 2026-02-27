/**
 * timestep-dropdown.js — Inline timestep selector component
 *
 * Renders a clickable inline value (e.g. "100ms") that expands into a
 * small dropdown. On selection it calls setStepMs() from the engine.
 */

import { setStepMs } from './engine.js';
import { getCAStepMs } from './modes/ca.js';

const OPTIONS = [
    { label: '25ms',  value: 25 },
    { label: '50ms',  value: 50 },
    { label: '100ms', value: 100 },
    { label: '200ms', value: 200 },
    { label: '500ms', value: 500 },
];

const instances = [];

function buildDropdown(container) {
    const current = getCAStepMs();

    const wrapper = document.createElement('span');
    wrapper.className = 'inline-select';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'inline-select-toggle';
    const match = OPTIONS.find(o => o.value === current) || OPTIONS[2];
    toggle.textContent = match.label + ' \u25BE';

    const list = document.createElement('ul');
    list.className = 'inline-select-options';
    list.hidden = true;

    OPTIONS.forEach(opt => {
        const li = document.createElement('li');
        li.textContent = opt.label;
        li.dataset.value = opt.value;
        if (opt.value === current) li.classList.add('selected');
        list.appendChild(li);
    });

    wrapper.appendChild(toggle);
    wrapper.appendChild(list);
    container.appendChild(wrapper);

    toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        const wasHidden = list.hidden;
        closeAll();
        list.hidden = !wasHidden;
    });

    list.addEventListener('click', function (e) {
        const li = e.target.closest('li');
        if (!li) return;
        const ms = parseInt(li.dataset.value, 10);
        setStepMs(ms);
        syncAll(ms);
        list.hidden = true;
    });

    instances.push({ toggle, list });
}

function syncAll(ms) {
    const match = OPTIONS.find(o => o.value === ms) || OPTIONS[2];
    instances.forEach(inst => {
        inst.toggle.textContent = match.label + ' \u25BE';
        inst.list.querySelectorAll('li').forEach(li => {
            li.classList.toggle('selected', parseInt(li.dataset.value, 10) === ms);
        });
    });
}

function closeAll() {
    instances.forEach(inst => { inst.list.hidden = true; });
}

document.addEventListener('click', closeAll);

export function initTimestepDropdowns() {
    document.querySelectorAll('.timestep-dropdown').forEach(buildDropdown);
}
