import React from 'react';
import { HospitalBlock } from '@/types/hospital';

import HeroBlock from './blocks/HeroBlock';
import DoctorsListBlock from './blocks/DoctorsListBlock';
import DepartmentsBlock from './blocks/DepartmentsBlock';
import BookingFormBlock from './blocks/BookingFormBlock';
import BookingButtonBlock from './blocks/BookingButtonBlock';
import TextBlock from './blocks/TextBlock';
import ImageBlock from './blocks/ImageBlock';
import ContactBlock from './blocks/ContactBlock';
import ContactBlockWrapper from './blocks/ContactBlockWrapper';
import { HospitalGalleryBlock } from './blocks/HospitalGalleryBlock';

function UnsupportedBlock({ type }: { type: string }) {
    const isDev = process.env.NODE_ENV === 'development';
    
    return (
        <div className="py-8 px-4 w-full flex justify-center">
            <div className={`p-4 border rounded-md text-sm ${isDev ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                {isDev ? (
                    <span><strong>Error:</strong> Unsupported block type: <code>{type}</code></span>
                ) : (
                    <span>Section unavailable</span>
                )}
            </div>
        </div>
    );
}

interface BlockRendererProps {
    blocks: HospitalBlock[];
    subdomain: string;
}

export default function BlockRenderer({ blocks, subdomain }: BlockRendererProps) {
    if (!blocks || blocks.length === 0) return null;

    // Sort blocks by order just in case they aren't sorted from backend
    const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
    const hasDepartmentsBlock = sortedBlocks.some(block => block.type === 'DEPARTMENTS_BLOCK');

    return (
        <>
            {sortedBlocks.map((block) => {
                const safeSettings = block.settings || {};
                
                switch (block.type) {
                    case 'HERO_BLOCK':
                        return <HeroBlock key={block.id} settings={safeSettings} subdomain={subdomain} />;
                    case 'DOCTORS_LIST_BLOCK':
                        return <DoctorsListBlock key={block.id} settings={safeSettings} subdomain={subdomain} />;
                    case 'DEPARTMENTS_BLOCK':
                        return (
                            <React.Fragment key={block.id}>
                                <DepartmentsBlock settings={safeSettings} subdomain={subdomain} />
                                <HospitalGalleryBlock subdomain={subdomain} />
                            </React.Fragment>
                        );
                    case 'BOOKING_FORM_BLOCK':
                        return <BookingFormBlock key={block.id} settings={safeSettings} subdomain={subdomain} />;
                    case 'BOOKING_BUTTON_BLOCK':
                        return <BookingButtonBlock key={block.id} settings={safeSettings} />;
                    case 'TEXT_BLOCK':
                        return <TextBlock key={block.id} settings={safeSettings} />;
                    case 'IMAGE_BLOCK':
                        return <ImageBlock key={block.id} settings={safeSettings} />;
                    case 'CONTACT_BLOCK':
                        return <ContactBlockWrapper key={block.id} settings={safeSettings} subdomain={subdomain} />;
                    default:
                        if (process.env.NODE_ENV === 'development') {
                            console.warn(`Unsupported block type: ${block.type}`);
                        }
                        return <UnsupportedBlock key={block.id} type={block.type} />;
                }
            })}
            {!hasDepartmentsBlock && <HospitalGalleryBlock subdomain={subdomain} />}
        </>
    );
}
