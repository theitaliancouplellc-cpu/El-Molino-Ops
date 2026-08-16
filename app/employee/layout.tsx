import './mobile-polish.css';
import EmployeeConnectionState from './connection-state';

export default function EmployeeLayout({children}:{children:React.ReactNode}){
 return <div className="employee-shell"><EmployeeConnectionState/>{children}</div>;
}
