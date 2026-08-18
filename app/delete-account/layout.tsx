import type {Metadata} from 'next';

export const metadata:Metadata={
  title:'Delete Account | El Molino Ops',
  description:'Request deletion of an El Molino Ops account and associated personal data.',
};

export default function DeleteAccountLayout({children}:{children:React.ReactNode}){
  return children;
}
