import { resolvePharmacyPath } from '@/lib/pharmacyTemplateRuntime'

export type DemoModeState = {
	isDemo: boolean
	ownerId: string
}

type SearchParamsLike = {
	get: (key: string) => string | null
} | null | undefined

export function isDemoEnabled(value: string | null | undefined): boolean {
	if (!value) return false
	return value.toLowerCase() === '1' || value.toLowerCase() === 'true'
}

export function parseDemoModeState(searchParams: SearchParamsLike): DemoModeState {
	const demoValue = searchParams?.get('demo')
	const ownerValue = searchParams?.get('owner')

	return {
		isDemo: isDemoEnabled(demoValue),
		ownerId: ownerValue?.trim() || '',
	}
}

export function buildDemoAwarePath(path: string, state: DemoModeState): string {
	const resolvedPath = resolvePharmacyPath(path, state.isDemo)
	const [base, hash] = resolvedPath.split('#')
	const [pathname, query = ''] = base.split('?')
	const params = new URLSearchParams(query)

	if (state.isDemo) params.set('demo', '1')
	if (state.ownerId) params.set('owner', state.ownerId)

	const nextQuery = params.toString()
	return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`
}
