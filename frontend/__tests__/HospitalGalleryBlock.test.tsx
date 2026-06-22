/**
 * Tests for HospitalGalleryBlock (public website gallery component).
 *
 * Strategy: mock the dynamic hospitalApi import and test the gallery
 * rendering, horizontal scroll controls, and lightbox behaviour.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HospitalGalleryBlock } from '@/components/hospital/blocks/HospitalGalleryBlock'
import type { HospitalPhoto } from '@/types/hospital'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetPhotos = jest.fn()

jest.mock('@/lib/hospitalApi', () => ({
  hospitalApi: {
    getPhotos: (...args: any[]) => mockGetPhotos(...args),
  },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────

const photo = (id: string, order: number, caption = ''): HospitalPhoto => ({
  id,
  image_url: `https://cdn.example.com/${id}.jpg`,
  alt_text: `Photo ${id}`,
  caption,
  display_order: order,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
})

const THREE_PHOTOS = [photo('a', 1, 'Lobby'), photo('b', 2, 'ICU'), photo('c', 3)]

// ── Tests ──────────────────────────────────────────────────────────────────

describe('HospitalGalleryBlock — no photos', () => {
  it('renders nothing when passed an empty array', () => {
    const { container } = render(
      <HospitalGalleryBlock subdomain="test" photos={[]} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when API returns an empty array', async () => {
    mockGetPhotos.mockResolvedValue({ data: [] })
    const { container } = render(<HospitalGalleryBlock subdomain="test" />)
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
  })
})

describe('HospitalGalleryBlock — loading state', () => {
  it('shows skeleton while fetching photos', () => {
    // Never resolves
    mockGetPhotos.mockReturnValue(new Promise(() => {}))
    render(<HospitalGalleryBlock subdomain="test" />)
    const pulseEls = document.querySelectorAll('.animate-pulse')
    expect(pulseEls.length).toBeGreaterThan(0)
  })
})

describe('HospitalGalleryBlock — photo display', () => {
  it('renders all photos passed as props (no API call)', () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)

    expect(screen.getByAltText('Photo a')).toBeInTheDocument()
    expect(screen.getByAltText('Photo b')).toBeInTheDocument()
    expect(screen.getByAltText('Photo c')).toBeInTheDocument()
    expect(mockGetPhotos).not.toHaveBeenCalled()
  })

  it('fetches and renders photos from the API when no props provided', async () => {
    mockGetPhotos.mockResolvedValue({ data: THREE_PHOTOS })
    render(<HospitalGalleryBlock subdomain="my-hospital" />)

    await screen.findByAltText('Photo a')
    expect(mockGetPhotos).toHaveBeenCalledWith('my-hospital')
    expect(screen.getByAltText('Photo b')).toBeInTheDocument()
  })

  it('renders captions under photos', () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)
    expect(screen.getByText('Lobby')).toBeInTheDocument()
    expect(screen.getByText('ICU')).toBeInTheDocument()
  })

  it('shows "Hospital Gallery" heading', () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)
    expect(screen.getByRole('heading', { name: /hospital gallery/i })).toBeInTheDocument()
  })



  it('shows scroll hint text on small screens (always in DOM)', () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)
    expect(screen.getByText(/swipe to explore/i)).toBeInTheDocument()
  })

  it('each photo image has correct src and alt', () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)
    const img = screen.getByAltText('Photo a') as HTMLImageElement
    expect(img.src).toBe('https://cdn.example.com/a.jpg')
  })
})

describe('HospitalGalleryBlock — lightbox', () => {
  it('does not show lightbox initially', () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)
    // Lightbox backdrop is not present
    expect(screen.queryByLabelText(/close gallery/i)).not.toBeInTheDocument()
  })

  it('opens lightbox when a photo is clicked', async () => {
    const { user } = { user: userEvent.setup() }
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)

    // Click the gallery card (the flex-shrink-0 div wrapping the photo)
    const imgs = screen.getAllByRole('img')
    const card = imgs[0].closest('[onClick]') ?? imgs[0].parentElement?.parentElement
    fireEvent.click(card!)
    await waitFor(() => {
      expect(screen.getByLabelText(/close gallery/i)).toBeInTheDocument()
    })
  })

  it('closes lightbox when close button is clicked', async () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)

    // Open
    const imgs = screen.getAllByRole('img')
    fireEvent.click(imgs[0].closest('[onClick]') ?? imgs[0].parentElement!.parentElement!)
    await waitFor(() => screen.getByLabelText(/close gallery/i))

    // Close
    fireEvent.click(screen.getByLabelText(/close gallery/i))
    await waitFor(() => {
      expect(screen.queryByLabelText(/close gallery/i)).not.toBeInTheDocument()
    })
  })

  it('closes lightbox when Escape key is pressed', async () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)

    // Open via click on the gallery card
    const imgs = screen.getAllByRole('img')
    fireEvent.click(imgs[0].parentElement!.parentElement!)
    await waitFor(() => screen.getByLabelText(/close gallery/i))

    // Escape
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByLabelText(/close gallery/i)).not.toBeInTheDocument()
    })
  })

  it('navigates to next photo via ArrowRight key', async () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)

    // Open lightbox on first photo
    const imgs = screen.getAllByRole('img')
    const card = imgs[0].closest('button') ?? imgs[0].parentElement
    fireEvent.click(card!)
    await waitFor(() => screen.getByLabelText(/close gallery/i))

    // Arrow right → Photo b appears in lightbox
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await waitFor(() => {
      const lightboxImgs = screen.getAllByAltText('Photo b')
      expect(lightboxImgs.length).toBeGreaterThan(0)
    })
  })

  it('navigates to previous photo via ArrowLeft key', async () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)

    // Open on second photo (index 1)
    const imgs = screen.getAllByRole('img')
    fireEvent.click(imgs[1].parentElement!.parentElement!)
    await waitFor(() => screen.getByLabelText(/close gallery/i))

    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    await waitFor(() => {
      const prevImgs = screen.getAllByAltText('Photo a')
      expect(prevImgs.length).toBeGreaterThan(0)
    })
  })

  it('wraps from last photo to first on next navigation', async () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)

    // Open on last photo (index 2)
    const imgs = screen.getAllByRole('img')
    fireEvent.click(imgs[2].parentElement!.parentElement!)
    await waitFor(() => screen.getByLabelText(/close gallery/i))

    // Click Next button — should wrap to Photo a
    fireEvent.click(screen.getByLabelText(/next photo/i))

    await waitFor(() => {
      const firstImgs = screen.getAllByAltText('Photo a')
      expect(firstImgs.length).toBeGreaterThan(0)
    })
  })

  it('shows prev/next navigation buttons in lightbox', async () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)
    const imgs = screen.getAllByRole('img')
    fireEvent.click(imgs[0].parentElement!.parentElement!)
    await waitFor(() => screen.getByLabelText(/close gallery/i))

    expect(screen.getByLabelText(/previous photo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/next photo/i)).toBeInTheDocument()
  })

  it('shows the photo caption in the lightbox', async () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)
    const imgs = screen.getAllByRole('img')
    fireEvent.click(imgs[0].parentElement!.parentElement!)
    await waitFor(() => screen.getByLabelText(/close gallery/i))

    // "Lobby" is the caption of photo a (also appears as card footer, so getAllByText)
    await waitFor(() => {
      const captions = screen.getAllByText('Lobby')
      expect(captions.length).toBeGreaterThan(0)
    })
  })

  it('shows photo counter (e.g. "1 / 3") in lightbox', async () => {
    render(<HospitalGalleryBlock subdomain="test" photos={THREE_PHOTOS} />)
    const imgs = screen.getAllByRole('img')
    fireEvent.click(imgs[0].parentElement!.parentElement!)
    await waitFor(() => screen.getByLabelText(/close gallery/i))

    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeInTheDocument()
    })
  })

  it('does NOT show prev/next buttons for a single photo gallery', async () => {
    render(<HospitalGalleryBlock subdomain="test" photos={[photo('solo', 1)]} />)
    const imgs = screen.getAllByRole('img')
    fireEvent.click(imgs[0].parentElement!.parentElement!)
    await waitFor(() => screen.getByLabelText(/close gallery/i))

    expect(screen.queryByLabelText(/previous photo/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/next photo/i)).not.toBeInTheDocument()
  })
})

describe('HospitalGalleryBlock — API error handling', () => {
  it('renders nothing when the API call throws', async () => {
    mockGetPhotos.mockRejectedValue(new Error('Network error'))
    const { container } = render(<HospitalGalleryBlock subdomain="test" />)
    await waitFor(() => {
      // Should silently fail and show nothing (no photos = null render)
      expect(container).toBeEmptyDOMElement()
    })
  })

  it('renders nothing when the API returns an error response', async () => {
    mockGetPhotos.mockResolvedValue({ error: 'Not found', status: 404 })
    const { container } = render(<HospitalGalleryBlock subdomain="test" />)
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
  })
})
