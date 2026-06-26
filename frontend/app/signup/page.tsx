'use client'

import React, { useState, Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { persistAuthSession } from '@/lib/auth'
import { FiHome, FiCheckCircle, FiAlertCircle } from 'react-icons/fi'

function SignupForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const type = searchParams.get('type') || 'hospital'

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    businessType: type,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  // Update business type when URL parameter changes
  useEffect(() => {
    setFormData((prev) => ({ ...prev, businessType: type }))
  }, [type])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      // Call backend API for signup
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 
        (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000/api` : 'http://localhost:8000/api')
      const response = await fetch(`${API_URL}/auth/signup/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email.trim(),
          password: formData.password,
          password_confirm: formData.confirmPassword,
          name: formData.name.trim(),
          business_type: formData.businessType,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle validation errors
        if (data.email) {
          setErrors({ email: data.email[0] })
        } else if (data.password) {
          setErrors({ password: data.password[0] })
        } else if (data.non_field_errors) {
          setErrors({ submit: data.non_field_errors[0] })
        } else {
          setErrors({ submit: 'Registration failed. Please try again.' })
        }
        return
      }

      // Store user data and tokens
      persistAuthSession({
        user: data.user,
        tokens: data.tokens,
        websiteSetupId: data.website_setup_id,
      })

      setSuccess(true)
      
      // Redirect to dashboard after 1 second
      setTimeout(() => {
        router.push('/dashboard')
      }, 1000)
    } catch (error) {
      console.error('Signup error:', error)
      setErrors({ submit: 'Network error. Please check if the backend server is running.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-light flex items-center justify-center p-4 sm:p-6 overflow-x-hidden w-full">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-full">
        {/* Left Side - Illustration */}
        <div className="bg-primary-light rounded-lg p-12 flex items-center justify-center hidden md:flex">
          <div className="text-center">
            <div className="w-64 h-64 bg-primary rounded-full mx-auto mb-6 flex items-center justify-center">
              <FiHome className="text-white" size={80} />
            </div>
            <h2 className="text-2xl font-bold text-neutral-dark mb-4">
              Get Started Today
            </h2>
            <p className="text-neutral-gray">
              Join thousands of medical professionals building their online presence
            </p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="bg-white rounded-lg shadow-lg p-6 sm:p-8 flex flex-col justify-center">
          <div className="mb-6 sm:mb-8">
            <Link href="/" className="text-xl sm:text-2xl font-bold text-primary mb-2 inline-block">
              Medify
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-dark mb-2">
              Create Your Account
            </h1>
            <p className="text-sm sm:text-base text-neutral-gray">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>

          {success ? (
            <div className="text-center py-8">
              <FiCheckCircle className="mx-auto text-success mb-4" size={64} />
              <h3 className="text-xl font-semibold text-neutral-dark mb-2">
                Account Created Successfully!
              </h3>
              <p className="text-neutral-gray">
                Redirecting to your dashboard...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {errors.submit && (
                <div className="bg-error/10 border border-error rounded-lg p-4 flex items-center gap-3">
                  <FiAlertCircle className="text-error" size={20} />
                  <p className="text-error text-sm">{errors.submit}</p>
                </div>
              )}

              <Select
                label="Business Type"
                options={[
                  { value: 'hospital', label: 'Hospital/Clinic' },
                  { value: 'pharmacy', label: 'Pharmacy' },
                ]}
                value={formData.businessType}
                onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                required
              />

              <Input
                type="text"
                label="Full Name"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value })
                  if (errors.name) setErrors({ ...errors, name: '' })
                }}
                error={errors.name}
                required
              />

              <Input
                type="email"
                label="Email Address"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value })
                  if (errors.email) setErrors({ ...errors, email: '' })
                }}
                error={errors.email}
                required
              />

              <Input
                type="password"
                label="Password"
                placeholder="Create a strong password"
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value })
                  if (errors.password) setErrors({ ...errors, password: '' })
                }}
                error={errors.password}
                showPasswordToggle
                required
              />

              <Input
                type="password"
                label="Confirm Password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={(e) => {
                  setFormData({ ...formData, confirmPassword: e.target.value })
                  if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' })
                }}
                error={errors.confirmPassword}
                showPasswordToggle
                required
              />

              <Button 
                type="submit" 
                variant="primary" 
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-neutral-gray">
              By signing up, you agree to our{' '}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignupForm />
    </Suspense>
  )
}

