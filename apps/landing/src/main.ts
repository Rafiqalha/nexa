// Landing NEXA: HTML statis + modul animasi flat buatan sendiri (tanpa framework, tanpa
// pustaka animasi). Setiap modul aman bila elemennya tidak ada.
import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import './styles/landing.css';
import { mountIcons } from './lib/icons';
import { initArena } from './modules/arena';
import { initChrome } from './modules/chrome';
import { initCopy, initRipples } from './modules/interactions';
import { initManifesto } from './modules/manifesto';
import { initPlayground } from './modules/playground';
import { initResults } from './modules/results';
import { initReveal } from './modules/reveal';
import { initRotator } from './modules/rotator';
import { initStory } from './modules/story';
import { initWordmark } from './modules/wordmark';

document.documentElement.classList.add('js');
mountIcons(document);
initChrome();
initReveal(document);

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);

const rotator = q<HTMLElement>('.rotator');
if (rotator) initRotator(rotator);
const arena = q<HTMLElement>('.arena');
if (arena) initArena(arena);
const manifesto = q<HTMLElement>('[data-manifesto]');
if (manifesto) initManifesto(manifesto);
const story = q<HTMLElement>('#cara-kerja');
if (story) initStory(story);
const play = q<HTMLElement>('#labirin');
if (play) initPlayground(play);
const bars = q<HTMLElement>('[data-bars]');
const stats = q<HTMLElement>('[data-stats]');
if (bars && stats) initResults(bars, stats);
const wordmark = q<HTMLCanvasElement>('.wordmark');
if (wordmark) initWordmark(wordmark);
initRipples(document);
initCopy(document);
