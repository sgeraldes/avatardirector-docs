// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const SITE = 'https://sgeraldes.github.io';
const BASE = '/avatardirector-docs';

export default defineConfig({
	site: SITE,
	base: BASE,
	trailingSlash: 'never',
	integrations: [
		starlight({
			title: 'AvatarDirector',
			description:
				'Real-time avatar control for Unreal Engine 5.7. Drives a MetaHuman from any backend over a single TCP socket.',
			logo: {
				src: './src/assets/ad-mark.png',
				replacesTitle: false,
			},
			favicon: '/favicon.png',
			customCss: ['./src/styles/global.css'],
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/sgeraldes/avatardirector-docs',
				},
			],
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
				es: { label: 'Español', lang: 'es' },
			},
			pagefind: true,
			sidebar: [
				{
					label: 'Getting started',
					translations: { es: 'Comenzar' },
					items: [
						{ label: 'Overview', translations: { es: 'Visión general' }, slug: 'overview' },
						{ label: 'Prerequisites', translations: { es: 'Requisitos' }, slug: 'prerequisites' },
						{ label: 'Installation', translations: { es: 'Instalación' }, slug: 'installation' },
					],
				},
				{
					label: 'TCP protocol & backend',
					translations: { es: 'Protocolo TCP y backend' },
					items: [
						{ label: 'TCP protocol', translations: { es: 'Protocolo TCP' }, slug: 'protocol/tcp' },
						{ label: 'Lip-sync settings', translations: { es: 'Ajustes de lip-sync' }, slug: 'protocol/lipsync-settings' },
						{ label: 'Session lifecycle', translations: { es: 'Ciclo de vida de la sesión' }, slug: 'protocol/session-lifecycle' },
					],
				},
				{
					label: 'Reference',
					translations: { es: 'Referencia' },
					items: [
						{ label: 'Support', translations: { es: 'Soporte' }, slug: 'reference/support' },
					],
				},
				{
					label: 'Release notes',
					translations: { es: 'Notas de versión' },
					items: [
						{ label: 'LS009 — Session persistence & mouth gate', translations: { es: 'LS009 — Persistencia de sesión y mouth gate' }, slug: 'releases/ls009' },
					],
				},
			],
		}),
		sitemap(),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
