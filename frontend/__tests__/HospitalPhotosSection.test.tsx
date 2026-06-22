/**
 * Tests for HospitalPhotosSection (dashboard admin component).
 *
 * Strategy: mock hospitalAdminApi and ToastProvider so we only test
 * the React component logic in isolation — no real HTTP calls.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock the API module
jest.mock('@/lib/hospitalAdminApi', () => ({
  hospitalAdminApi: {
    listPhotos: jest.fn(),
    uploadPhoto: jest.fn(),
    updatePhoto: jest.fn(),
    deletePhoto: jest.fn(),
    updatePhotoOrder: jest.fn(),
  },
}))

// Mock Modal so it always renders children (no portal issues in jsdom)
jest.mock('@/components/ui/Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
}))

// Mock Card — just a passthrough div
jest.mock('@/components/ui/Card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

// Mock Button — native button
jest.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = 'button',
    className,
    variant,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button onClick={onClick} disabled={disabled} type={type as 'button' | 'submit'} className={className}>
      {children}
    </button>
  ),
}))

// Mock Input
jest.mock('@/components/ui/Input', () => ({
  Input: ({ label, value, onChange, placeholder }: any) => (
    <div>
      {label && <label>{label}</label>}
      <input value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  ),
}))

// Mock useToast
const mockShowToast = jest.fn()
jest.mock('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

// ── Imports (after mocks are registered) ──────────────────────────────────

import { hospitalAdminApi } from '@/lib/hospitalAdminApi'
import { HospitalPhotosSection } from '@/components/hospital/HospitalPhotosSection'
import type { HospitalPhoto } from '@/types/hospital'

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockPhoto = (overrides: Partial<HospitalPhoto> = {}): HospitalPhoto => ({
  id: 'photo-1',
  image_url: 'https://example.com/photo1.jpg',
  alt_text: 'Reception hall',
  caption: 'Our beautiful reception',
  display_order: 1,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
})

const mockPhotoB = mockPhoto({ id: 'photo-2', alt_text: 'ICU Ward', display_order: 2, caption: '' })
const mockPhotoC = mockPhoto({ id: 'photo-3', alt_text: 'X-Ray Room', display_order: 3, caption: '' })

// ── Helper ────────────────────────────────────────────────────────────────

const api = hospitalAdminApi as jest.Mocked<typeof hospitalAdminApi>

function setup() {
  const user = userEvent.setup()
  const utils = render(<HospitalPhotosSection />)
  return { user, ...utils }
}

// ── Test suites ───────────────────────────────────────────────────────────

describe('HospitalPhotosSection — Loading state', () => {
  it('shows a skeleton loader while fetching photos', () => {
    // Never resolves during this test
    api.listPhotos.mockReturnValue(new Promise(() => {}))
    render(<HospitalPhotosSection />)
    // Skeleton items have the animate-pulse class
    const pulseEls = document.querySelectorAll('.animate-pulse')
    expect(pulseEls.length).toBeGreaterThan(0)
  })
})

describe('HospitalPhotosSection — Empty state', () => {
  beforeEach(() => {
    api.listPhotos.mockResolvedValue({ data: [], status: 200 })
  })

  it('renders the empty-state message when there are no photos', async () => {
    render(<HospitalPhotosSection />)
    await screen.findByText(/no photos yet/i)
  })

  it('shows an "Upload First Photo" button in the empty state', async () => {
    render(<HospitalPhotosSection />)
    await screen.findByText(/upload first photo/i)
  })

  it('opens the upload modal when "Upload First Photo" is clicked', async () => {
    const { user } = setup()
    await screen.findByText(/upload first photo/i)
    await user.click(screen.getByText(/upload first photo/i))
    expect(screen.getByTestId('modal')).toBeInTheDocument()
    expect(screen.getByText(/upload new photo/i)).toBeInTheDocument()
  })
})

describe('HospitalPhotosSection — Photo list', () => {
  beforeEach(() => {
    api.listPhotos.mockResolvedValue({ data: [mockPhoto(), mockPhotoB, mockPhotoC], status: 200 })
  })

  it('renders all loaded photos', async () => {
    render(<HospitalPhotosSection />)
    await screen.findByText('Reception hall')
    expect(screen.getByText('ICU Ward')).toBeInTheDocument()
    expect(screen.getByText('X-Ray Room')).toBeInTheDocument()
  })

  it('renders photo thumbnails', async () => {
    render(<HospitalPhotosSection />)
    await screen.findByText('Reception hall')
    const images = screen.getAllByRole('img')
    expect(images.length).toBeGreaterThanOrEqual(1)
    expect(images[0]).toHaveAttribute('src', 'https://example.com/photo1.jpg')
  })

  it('displays a photo count summary', async () => {
    render(<HospitalPhotosSection />)
    await screen.findByText(/3 photos/i)
  })

  it('shows error toast when listPhotos fails', async () => {
    api.listPhotos.mockResolvedValue({ error: 'Server error', status: 500 })
    render(<HospitalPhotosSection />)
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Loading Failed' })
      )
    })
  })
})

describe('HospitalPhotosSection — Upload modal', () => {
  beforeEach(() => {
    api.listPhotos.mockResolvedValue({ data: [], status: 200 })
    api.uploadPhoto.mockResolvedValue({ data: mockPhoto(), status: 201 })
    mockShowToast.mockClear()
  })

  it('opens the upload modal via the empty state "Upload First Photo" button', async () => {
    const { user } = setup()
    await screen.findByText(/no photos yet/i)
    await user.click(screen.getByRole('button', { name: /upload first photo/i }))
    expect(screen.getByTestId('modal')).toBeInTheDocument()
  })

  it('shows an error toast when submitting without a file', async () => {
    const { user } = setup()
    await screen.findByText(/no photos yet/i)
    await user.click(screen.getByRole('button', { name: /upload first photo/i }))

    // Click Upload Photo without selecting a file
    const uploadBtn = within(screen.getByTestId('modal')).getByRole('button', { name: /upload photo/i })
    await user.click(uploadBtn)

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'File Required' })
    )
  })

  it('closes the modal when Cancel is clicked', async () => {
    const { user } = setup()
    await screen.findByText(/no photos yet/i)
    await user.click(screen.getByRole('button', { name: /upload first photo/i }))
    expect(screen.getByTestId('modal')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
  })

  it('calls uploadPhoto with FormData and shows success toast', async () => {
    const { user } = setup()
    await screen.findByText(/no photos yet/i)
    await user.click(screen.getByRole('button', { name: /upload first photo/i }))

    // Fill alt text
    const altInput = within(screen.getByTestId('modal')).getByPlaceholderText(/describe the image/i)
    await user.type(altInput, 'New photo alt')

    // Attach a fake file
    const fileInput = document.getElementById('photo-upload-input') as HTMLInputElement
    const fakeFile = new File(['(jpeg bytes)'], 'test.jpg', { type: 'image/jpeg' })
    await user.upload(fileInput, fakeFile)

    // Submit
    const uploadBtn = within(screen.getByTestId('modal')).getByRole('button', { name: /upload photo/i })
    await user.click(uploadBtn)

    await waitFor(() => {
      expect(api.uploadPhoto).toHaveBeenCalledWith(expect.any(FormData))
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', title: 'Photo Uploaded' })
      )
    })
  })

  it('adds the new photo to the list after successful upload', async () => {
    api.listPhotos.mockResolvedValue({ data: [], status: 200 })
    api.uploadPhoto.mockResolvedValue({ data: mockPhoto({ alt_text: 'Uploaded Photo' }), status: 201 })

    const { user } = setup()
    await screen.findByText(/no photos yet/i)
    await user.click(screen.getByRole('button', { name: /upload first photo/i }))

    const fileInput = document.getElementById('photo-upload-input') as HTMLInputElement
    await user.upload(fileInput, new File(['x'], 'x.jpg', { type: 'image/jpeg' }))
    await user.click(within(screen.getByTestId('modal')).getByRole('button', { name: /upload photo/i }))

    await screen.findByText('Uploaded Photo')
  })

  it('shows error toast when uploadPhoto fails', async () => {
    api.uploadPhoto.mockResolvedValue({ error: 'Upload error', status: 500 })
    const { user } = setup()
    await screen.findByText(/no photos yet/i)
    await user.click(screen.getByRole('button', { name: /upload first photo/i }))

    const fileInput = document.getElementById('photo-upload-input') as HTMLInputElement
    await user.upload(fileInput, new File(['x'], 'x.jpg', { type: 'image/jpeg' }))
    await user.click(within(screen.getByTestId('modal')).getByRole('button', { name: /upload photo/i }))

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Upload Failed' })
      )
    })
  })
})

describe('HospitalPhotosSection — Edit photo', () => {
  beforeEach(() => {
    api.listPhotos.mockResolvedValue({ data: [mockPhoto()], status: 200 })
    api.updatePhoto.mockResolvedValue({ data: mockPhoto({ alt_text: 'Updated Alt' }), status: 200 })
    mockShowToast.mockClear()
  })

  it('opens the upload modal via the bottom "Add Photo" button when list is not empty', async () => {
    const { user } = setup()
    await screen.findByText('Reception hall')

    const addBtn = screen.getByRole('button', { name: /add photo/i })
    await user.click(addBtn)

    expect(screen.getByTestId('modal')).toBeInTheDocument()
    expect(screen.getByText(/upload new photo/i)).toBeInTheDocument()
  })

  it('opens the modal pre-filled when edit button is clicked', async () => {
    const { user } = setup()
    await screen.findByText('Reception hall')

    // Click the edit (pencil) button
    const editBtn = screen.getByTitle('Edit photo')
    await user.click(editBtn)

    expect(screen.getByTestId('modal')).toBeInTheDocument()
    expect(screen.getByText(/edit photo/i)).toBeInTheDocument()
    // Alt text should be pre-filled
    const altInput = screen.getByDisplayValue('Reception hall')
    expect(altInput).toBeInTheDocument()
  })

  it('calls updatePhoto and shows success toast on save', async () => {
    const { user } = setup()
    await screen.findByText('Reception hall')
    await user.click(screen.getByTitle('Edit photo'))

    const updateBtn = within(screen.getByTestId('modal')).getByRole('button', { name: /update photo/i })
    await user.click(updateBtn)

    await waitFor(() => {
      expect(api.updatePhoto).toHaveBeenCalledWith('photo-1', expect.any(FormData))
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', title: 'Photo Updated' })
      )
    })
  })

  it('updates the photo in the list after successful edit', async () => {
    api.updatePhoto.mockResolvedValue({
      data: mockPhoto({ alt_text: 'Updated Alt Text' }),
      status: 200,
    })

    const { user } = setup()
    await screen.findByText('Reception hall')
    await user.click(screen.getByTitle('Edit photo'))
    await user.click(within(screen.getByTestId('modal')).getByRole('button', { name: /update photo/i }))

    await screen.findByText('Updated Alt Text')
  })
})

describe('HospitalPhotosSection — Delete photo', () => {
  beforeEach(() => {
    api.listPhotos.mockResolvedValue({ data: [mockPhoto(), mockPhotoB], status: 200 })
    api.deletePhoto.mockResolvedValue({ data: undefined, status: 204 })
    mockShowToast.mockClear()
    // Auto-confirm the delete dialog
    jest.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('calls deletePhoto with the correct id when delete is clicked', async () => {
    const { user } = setup()
    await screen.findByText('Reception hall')

    const deleteButtons = screen.getAllByTitle('Delete photo')
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(api.deletePhoto).toHaveBeenCalledWith('photo-1')
    })
  })

  it('removes the photo from the list after successful delete', async () => {
    const { user } = setup()
    await screen.findByText('Reception hall')

    await user.click(screen.getAllByTitle('Delete photo')[0])

    await waitFor(() => {
      expect(screen.queryByText('Reception hall')).not.toBeInTheDocument()
    })
    expect(screen.getByText('ICU Ward')).toBeInTheDocument()
  })

  it('shows success toast after delete', async () => {
    const { user } = setup()
    await screen.findByText('Reception hall')
    await user.click(screen.getAllByTitle('Delete photo')[0])

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', title: 'Photo Deleted' })
      )
    })
  })

  it('does not delete when user cancels the confirm dialog', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false)
    const { user } = setup()
    await screen.findByText('Reception hall')

    await user.click(screen.getAllByTitle('Delete photo')[0])

    expect(api.deletePhoto).not.toHaveBeenCalled()
    expect(screen.getByText('Reception hall')).toBeInTheDocument()
  })

  it('shows error toast when deletePhoto fails', async () => {
    api.deletePhoto.mockResolvedValue({ error: 'Delete failed', status: 500 })
    const { user } = setup()
    await screen.findByText('Reception hall')
    await user.click(screen.getAllByTitle('Delete photo')[0])

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Delete Failed' })
      )
    })
  })
})

describe('HospitalPhotosSection — Reorder photos', () => {
  const photos = [mockPhoto(), mockPhotoB, mockPhotoC]

  beforeEach(() => {
    api.listPhotos.mockResolvedValue({ data: photos, status: 200 })
    api.updatePhotoOrder.mockResolvedValue({ data: [...photos].reverse(), status: 200 })
    mockShowToast.mockClear()
  })

  it('Move Up button is disabled for the first photo', async () => {
    render(<HospitalPhotosSection />)
    await screen.findByText('Reception hall')

    const moveUpButtons = screen.getAllByTitle('Move up')
    expect(moveUpButtons[0]).toBeDisabled()
    expect(moveUpButtons[1]).not.toBeDisabled()
  })

  it('Move Down button is disabled for the last photo', async () => {
    render(<HospitalPhotosSection />)
    await screen.findByText('X-Ray Room')

    const moveDownButtons = screen.getAllByTitle('Move down')
    expect(moveDownButtons[moveDownButtons.length - 1]).toBeDisabled()
    expect(moveDownButtons[0]).not.toBeDisabled()
  })

  it('calls updatePhotoOrder with swapped IDs when Move Down is clicked', async () => {
    const { user } = setup()
    await screen.findByText('Reception hall')

    const moveDownButtons = screen.getAllByTitle('Move down')
    await user.click(moveDownButtons[0])

    await waitFor(() => {
      expect(api.updatePhotoOrder).toHaveBeenCalledWith(
        expect.arrayContaining(['photo-2', 'photo-1'])
      )
    })
    // Ensure photo-2 comes before photo-1 in the call
    const callArg: string[] = api.updatePhotoOrder.mock.calls[0][0]
    expect(callArg.indexOf('photo-2')).toBeLessThan(callArg.indexOf('photo-1'))
  })

  it('calls updatePhotoOrder with swapped IDs when Move Up is clicked', async () => {
    const { user } = setup()
    await screen.findByText('ICU Ward')

    const moveUpButtons = screen.getAllByTitle('Move up')
    await user.click(moveUpButtons[1]) // second photo's "move up"

    await waitFor(() => {
      expect(api.updatePhotoOrder).toHaveBeenCalled()
    })
    const callArg: string[] = api.updatePhotoOrder.mock.calls[0][0]
    expect(callArg.indexOf('photo-2')).toBeLessThan(callArg.indexOf('photo-1'))
  })

  it('shows error toast when reorder fails', async () => {
    api.updatePhotoOrder.mockResolvedValue({ error: 'Reorder failed', status: 500 })
    // After error, it reloads — mock the reload
    api.listPhotos
      .mockResolvedValueOnce({ data: photos, status: 200 }) // initial load
      .mockResolvedValueOnce({ data: photos, status: 200 }) // reload after error

    const { user } = setup()
    await screen.findByText('Reception hall')

    await user.click(screen.getAllByTitle('Move down')[0])

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Reorder Failed' })
      )
    })
  })
})
