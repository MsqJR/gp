import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import HospitalChatWidget from '@/components/hospital/HospitalChatWidget'

// Mock the API library
jest.mock('@/lib/api', () => ({
  API_BASE_URL: 'http://localhost:8000/api',
  getAuthToken: () => null,
  chatbotApi: {
    sendMessage: jest.fn(),
  },
}))

describe('HospitalChatWidget — WhatsApp Button', () => {
  it('does not render the WhatsApp button if whatsAppNumber is not provided', () => {
    render(<HospitalChatWidget subdomain="test-subdomain" />)
    
    // Check chatbot toggle is rendered
    expect(screen.getByLabelText('Open AI Symptom Chatbot')).toBeInTheDocument()
    
    // Check WhatsApp toggle is NOT rendered
    const whatsappToggle = document.getElementById('hospital-whatsapp-toggle')
    expect(whatsappToggle).not.toBeInTheDocument()
  })

  it('renders the WhatsApp button if whatsAppNumber is provided', () => {
    render(
      <HospitalChatWidget 
        subdomain="test-subdomain" 
        whatsAppNumber="01234567890" 
      />
    )
    
    // Check WhatsApp toggle is rendered
    const whatsappToggle = document.getElementById('hospital-whatsapp-toggle')
    expect(whatsappToggle).toBeInTheDocument()
    expect(whatsappToggle).toHaveAttribute('aria-label', 'Chat on WhatsApp')
  })

  it('formats Egyptian mobile numbers correctly by adding the prefix 2', () => {
    render(
      <HospitalChatWidget 
        subdomain="test-subdomain" 
        whatsAppNumber="01234567890" 
      />
    )
    
    const whatsappToggle = document.getElementById('hospital-whatsapp-toggle') as HTMLAnchorElement
    expect(whatsappToggle).toBeInTheDocument()
    expect(whatsappToggle.href).toBe('https://wa.me/201234567890')
  })

  it('preserves country codes if already prefixing the number', () => {
    render(
      <HospitalChatWidget 
        subdomain="test-subdomain" 
        whatsAppNumber="+201234567890" 
      />
    )
    
    const whatsappToggle = document.getElementById('hospital-whatsapp-toggle') as HTMLAnchorElement
    expect(whatsappToggle.href).toBe('https://wa.me/201234567890')
  })

  it('strips leading 00 and formats the number', () => {
    render(
      <HospitalChatWidget 
        subdomain="test-subdomain" 
        whatsAppNumber="00201234567890" 
      />
    )
    
    const whatsappToggle = document.getElementById('hospital-whatsapp-toggle') as HTMLAnchorElement
    expect(whatsappToggle.href).toBe('https://wa.me/201234567890')
  })

  it('hides the WhatsApp button when the chatbot widget is opened', () => {
    render(
      <HospitalChatWidget 
        subdomain="test-subdomain" 
        whatsAppNumber="01234567890" 
      />
    )
    
    // Initially, both the chatbot toggle and WhatsApp toggle are visible
    const chatbotToggle = screen.getByLabelText('Open AI Symptom Chatbot')
    const whatsappToggle = document.getElementById('hospital-whatsapp-toggle')
    expect(chatbotToggle).toBeInTheDocument()
    expect(whatsappToggle).toBeInTheDocument()

    // Click chatbot toggle to open it
    fireEvent.click(chatbotToggle)

    // The chatbot is now open (toggle button is unmounted)
    expect(screen.queryByLabelText('Open AI Symptom Chatbot')).not.toBeInTheDocument()
    
    // The WhatsApp button should also be unmounted/hidden
    expect(document.getElementById('hospital-whatsapp-toggle')).not.toBeInTheDocument()
  })
})
