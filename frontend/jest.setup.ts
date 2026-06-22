import '@testing-library/jest-dom'

// jsdom doesn't implement URL.createObjectURL — stub it for file upload tests
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = jest.fn()

// Reset all mocks between every test so state never leaks
beforeEach(() => {
  jest.clearAllMocks()
})
