import React from 'react'
import { reviewApi } from '@/lib/api'
import ReviewForm from '@/components/review/ReviewForm'
import { Card } from '@/components/ui/Card'

interface PageProps {
  params: {
    token: string
  }
}

export const dynamic = 'force-dynamic'

export default async function ReviewPage({ params }: PageProps) {
  const resolvedParams = await params
  const token = resolvedParams.token

  // Fetch the review context from the server
  let response
  try {
    response = await reviewApi.getReviewContext(token)
  } catch (err) {
    console.warn('ReviewPage: could not reach backend', err)
    response = { error: 'Service temporarily unavailable. Please try again later.' }
  }

  if (response.error || !response.data) {
    return (
      <main className="min-h-screen bg-neutral-light/50 flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center border-error/20">
          <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-neutral-dark mb-2">Review Not Available</h1>
          <p className="text-neutral-gray">{response.error || 'Invalid or expired token.'}</p>
        </Card>
      </main>
    )
  }

  const { doctor_name, hospital_name, start_datetime } = response.data
  const date = new Date(start_datetime)
  const formattedDate = date.toLocaleDateString(undefined, { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })

  return (
    <main className="min-h-screen bg-neutral-light/50 py-12 px-4 flex flex-col">
      <div className="max-w-3xl w-full mx-auto mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary-dark mb-4">Patient Feedback</h1>
        <p className="text-neutral-gray text-lg">
          How was your visit with <span className="font-semibold text-neutral-dark">{doctor_name}</span> at <span className="font-semibold text-neutral-dark">{hospital_name}</span> on {formattedDate}?
        </p>
      </div>

      <ReviewForm token={token} />
    </main>
  )
}
