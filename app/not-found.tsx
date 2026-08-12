import { SearchX } from 'lucide-react';

export default function NotFound(){
  return <main className="auth-wrap"><div className="auth-card"><div className="onboard-icon"><SearchX/></div><h1>Page not found.</h1><p>That part of El Molino Ops does not exist or has moved.</p><a className="btn" style={{width:'100%'}} href="/">Go home</a></div></main>;
}
