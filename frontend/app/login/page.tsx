'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { persistAuthSession } from '@/lib/auth'
import { FiMail, FiLock, FiAlertCircle } from 'react-icons/fi'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const newErrors: Record<string, string> = {}

    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!password) {
      newErrors.password = 'Password is required'
    }

    setErrors(newErrors)
    
    if (Object.keys(newErrors).length > 0) {
      return
    }

    setIsLoading(true)

    try {
      // Call backend API for login
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 
        (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000/api` : 'http://localhost:8000/api')
      const response = await fetch(`${API_URL}/auth/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password: password,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle error response
        if (response.status === 401) {
          setErrors({ submit: 'Invalid email or password. Please check your credentials.' })
        } else {
          setErrors({ submit: data.error || 'Something went wrong. Please try again.' })
        }
        return
      }

      // Store user data and tokens
      persistAuthSession({
        user: data.user,
        tokens: data.tokens,
      })

      // Redirect to dashboard
      router.push('/dashboard')
    } catch (error) {
      console.error('Login error:', error)
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
              <FiMail className="text-white" size={80} />
            </div>
            <h2 className="text-2xl font-bold text-neutral-dark mb-4">
              Welcome Back
            </h2>
            <p className="text-neutral-gray">
              Sign in to continue building your medical website
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
              Login to Your Account
            </h1>
            <p className="text-sm sm:text-base text-neutral-gray">
              Don't have an account?{' '}
              <Link href="/signup" className="text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {errors.submit && (
              <div className="bg-error/10 border border-error rounded-lg p-4 flex items-center gap-3">
                <FiAlertCircle className="text-error" size={20} />
                <p className="text-error text-sm">{errors.submit}</p>
              </div>
            )}

            <Input
              type="email"
              label="Email Address"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (errors.email) setErrors({ ...errors, email: '' })
              }}
              error={errors.email}
              required
            />

            <div>
              <Input
                type="password"
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (errors.password) setErrors({ ...errors, password: '' })
                }}
                error={errors.password}
                showPasswordToggle
                required
              />
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 text-sm text-neutral-gray">
                  <input type="checkbox" className="rounded" />
                  Remember me
                </label>
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button 
              type="submit" 
              variant="primary" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-neutral-gray">
              By signing in, you agree to our{' '}
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

