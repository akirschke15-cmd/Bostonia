'use client';

import { useParams } from 'next/navigation';
import { RemixEditor } from '@/components/characters';

export default function CharacterEditPage() {
  const params = useParams();
  const characterId = params.id as string;

  return <RemixEditor characterId={characterId} />;
}
