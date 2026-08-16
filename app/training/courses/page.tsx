'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../../ops-tools.module.css';

type Profile = { app_role: 'admin' | 'manager' | 'employee'; location_id: string | null };
type Employee = { id: string; full_name: string };
type Role = { id: string; name: string; department: string | null };
type Lesson = { id: string; title: string; lesson_type: 'text' | 'image' | 'video' | 'quiz' | 'task' | 'acknowledgment'; content: string | null; media_url: string | null; pass_score: number | null; active: boolean };
type Course = { id: string; name: string; description: string | null; active: boolean };
type CourseLesson = { id: string; course_id: string; lesson_id: string; position: number; required: boolean };
type Question = { id: string; lesson_id: string; position: number; prompt: string; options: string[]; correct_option: number; explanation: string | null };
type Assignment = { id: string; course_id: string; employee_id: string; status: 'assigned' | 'in_progress' | 'completed' | 'cancelled'; due_at: string | null; assigned_at: string; started_at: string | null; completed_at: string | null };
type Progress = { assignment_id: string; course_lesson_id: string; employee_id: string; status: 'not_started' | 'in_progress' | 'waiting_review' | 'completed' | 'rejected'; started_at: string | null; completed_at: string | null; last_score: number | null; attempts: number; reviewed_at: string | null; review_note: string | null };
type Comment = { id: string; assignment_id: string; course_lesson_id: string; employee_id: string; author_user_id: string; body: string; created_at: string };
type LessonPayload = { assignment_id: string; course_lesson_id: string; position: number; required: boolean; unlocked: boolean; lesson: { id: string; title: string; lesson_type: Lesson['lesson_type']; content: string | null; media_url: string | null; pass_score: number | null }; questions: { id: string; position: number; prompt: string; options: string[] }[] };

const lessonTypes: Lesson['lesson_type'][] = ['text', 'image', 'video', 'quiz', 'task', 'acknowledgment'];
const lessonLabel = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const fmt = (value: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export default function TrainingCoursesPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseLessons, setCourseLessons] = useState<CourseLesson[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [lessonForm, setLessonForm] = useState({ id: '', title: '', lesson_type: 'text' as Lesson['lesson_type'], content: '', media_url: '', pass_score: '80' });
  const [courseForm, setCourseForm] = useState({ id: '', name: '', description: '' });
  const [selectedCourse, setSelectedCourse] = useState('');
  const [courseLessonForm, setCourseLessonForm] = useState({ lesson_id: '', position: '1', required: true });
  const [questionForm, setQuestionForm] = useState({ id: '', lesson_id: '', position: '1', prompt: '', optionsText: 'Option 1\nOption 2', correct_option: '0', explanation: '' });
  const [assignForm, setAssignForm] = useState({ course_id: '', employeeIds: [] as string[], roleIds: [] as string[], departments: [] as string[], dueAt: '' });
  const [activeAssignmentId, setActiveAssignmentId] = useState('');
  const [activeCourseLessonId, setActiveCourseLessonId] = useState('');
  const [payload, setPayload] = useState<LessonPayload | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [taskComment, setTaskComment] = useState('');
  const [lessonComment, setLessonComment] = useState('');
  const canManage = profile?.app_role === 'admin' || profile?.app_role === 'manager';
  const departments = useMemo(() => Array.from(new Set(roles.map((role) => role.department).filter(Boolean) as string[])).sort(), [roles]);
  const selectedCourseRow = courses.find((course) => course.id === selectedCourse) || null;
  const selectedCourseLessons = useMemo(() => courseLessons.filter((item) => item.course_id === selectedCourse).sort((a, b) => a.position - b.position), [courseLessons, selectedCourse]);
  const myAssignments = useMemo(() => assignments.filter((item) => !myEmployeeId || item.employee_id === myEmployeeId), [assignments, myEmployeeId]);

  useEffect(() => { void init(); }, []);

  async function init() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { location.href = '/'; return; }
    const profileResult = await supabase.from('profiles').select('app_role,location_id').eq('id', userData.user.id).single();
    if (profileResult.error || !profileResult.data?.location_id) {
      setMessage('Could not load Training Courses.');
      setReady(true);
      return;
    }
    const nextProfile = profileResult.data as Profile;
    setProfile(nextProfile);
    const employeeResult = await supabase.rpc('time_clock_employee_id_for_user', {});
    if (!employeeResult.error) setMyEmployeeId((employeeResult.data as string | null) || null);
    await load(nextProfile, nextProfile.app_role === 'admin' || nextProfile.app_role === 'manager');
    setReady(true);
  }

  async function load(nextProfile = profile, manager = canManage) {
    if (!nextProfile?.location_id) return;
    setBusy(true);
    try {
      const shared = await Promise.all([
        supabase.from('training_courses').select('id,name,description,active').eq('location_id', nextProfile.location_id).eq('active', true).order('name'),
        supabase.from('training_lessons').select('id,title,lesson_type,content,media_url,pass_score,active').eq('location_id', nextProfile.location_id).eq('active', true).order('title'),
        supabase.from('training_course_lessons').select('id,course_id,lesson_id,position,required').eq('location_id', nextProfile.location_id).order('position'),
        supabase.from('training_course_assignments').select('id,course_id,employee_id,status,due_at,assigned_at,started_at,completed_at').eq('location_id', nextProfile.location_id).order('assigned_at', { ascending: false }),
        supabase.from('training_course_lesson_progress').select('assignment_id,course_lesson_id,employee_id,status,started_at,completed_at,last_score,attempts,reviewed_at,review_note').eq('location_id', nextProfile.location_id),
        supabase.from('training_lesson_comments').select('id,assignment_id,course_lesson_id,employee_id,author_user_id,body,created_at').eq('location_id', nextProfile.location_id).order('created_at'),
      ]);
      for (const result of shared) if (result.error) throw result.error;
      setCourses((shared[0].data ?? []) as Course[]);
      setLessons((shared[1].data ?? []) as Lesson[]);
      setCourseLessons((shared[2].data ?? []) as CourseLesson[]);
      setAssignments((shared[3].data ?? []) as Assignment[]);
      setProgress((shared[4].data ?? []) as Progress[]);
      setComments((shared[5].data ?? []) as Comment[]);

      if (manager) {
        const [employeeList, roleList, questionList] = await Promise.all([
          supabase.from('employees').select('id,full_name').eq('location_id', nextProfile.location_id).eq('active', true).is('deleted_at', null).order('full_name'),
          supabase.from('employee_roles').select('id,name,department').eq('location_id', nextProfile.location_id).order('name'),
          supabase.from('training_quiz_questions').select('id,lesson_id,position,prompt,options,correct_option,explanation').eq('location_id', nextProfile.location_id).order('position'),
        ]);
        for (const result of [employeeList, roleList, questionList]) if (result.error) throw result.error;
        setEmployees((employeeList.data ?? []) as Employee[]);
        setRoles((roleList.data ?? []) as Role[]);
        setQuestions((questionList.data ?? []) as Question[]);
      }

      const courseList = (shared[0].data ?? []) as Course[];
      if (!selectedCourse && courseList.length) setSelectedCourse(courseList[0].id);
      if (!assignForm.course_id && courseList.length) setAssignForm((current) => ({ ...current, course_id: courseList[0].id }));
    } catch (error: any) {
      setMessage(error?.message || 'Could not load Training Courses.');
    } finally {
      setBusy(false);
    }
  }

  async function saveLesson(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !profile?.location_id || busy || !lessonForm.title.trim()) return;
    const payloadRow = {
      location_id: profile.location_id,
      title: lessonForm.title.trim(),
      lesson_type: lessonForm.lesson_type,
      content: lessonForm.content.trim() || null,
      media_url: lessonForm.media_url.trim() || null,
      pass_score: lessonForm.lesson_type === 'quiz' ? Number(lessonForm.pass_score || 80) : null,
      active: true,
    };
    setBusy(true);
    const result = lessonForm.id
      ? await supabase.from('training_lessons').update(payloadRow).eq('id', lessonForm.id)
      : await supabase.from('training_lessons').insert(payloadRow);
    setMessage(result.error ? result.error.message : lessonForm.id ? 'Lesson updated.' : 'Lesson created.');
    if (!result.error) setLessonForm({ id: '', title: '', lesson_type: 'text', content: '', media_url: '', pass_score: '80' });
    await load();
    setBusy(false);
  }

  async function saveCourse(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !profile?.location_id || busy || !courseForm.name.trim()) return;
    const row = { location_id: profile.location_id, name: courseForm.name.trim(), description: courseForm.description.trim() || null, active: true };
    setBusy(true);
    const result = courseForm.id ? await supabase.from('training_courses').update(row).eq('id', courseForm.id) : await supabase.from('training_courses').insert(row);
    setMessage(result.error ? result.error.message : courseForm.id ? 'Course updated.' : 'Course created.');
    if (!result.error) setCourseForm({ id: '', name: '', description: '' });
    await load();
    setBusy(false);
  }

  async function addCourseLesson(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !profile?.location_id || !selectedCourse || !courseLessonForm.lesson_id || busy) return;
    setBusy(true);
    const { error } = await supabase.from('training_course_lessons').insert({
      course_id: selectedCourse,
      location_id: profile.location_id,
      lesson_id: courseLessonForm.lesson_id,
      position: Number(courseLessonForm.position),
      required: courseLessonForm.required,
    });
    setMessage(error ? error.message : 'Lesson added to course.');
    if (!error) setCourseLessonForm({ lesson_id: '', position: String(selectedCourseLessons.length + 2), required: true });
    await load();
    setBusy(false);
  }

  async function removeCourseLesson(id: string) {
    if (!canManage || busy || !window.confirm('Remove this lesson from the course? Existing assignment progress for this course step will also be removed.')) return;
    setBusy(true);
    const { error } = await supabase.from('training_course_lessons').delete().eq('id', id);
    setMessage(error ? error.message : 'Lesson removed from course.');
    await load();
    setBusy(false);
  }

  async function saveQuestion(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !profile?.location_id || busy || !questionForm.lesson_id || !questionForm.prompt.trim()) return;
    const options = questionForm.optionsText.split('\n').map((item) => item.trim()).filter(Boolean);
    const correct = Number(questionForm.correct_option);
    if (options.length < 2 || correct < 0 || correct >= options.length) {
      setMessage('Quiz question needs at least two options and a valid correct option index.');
      return;
    }
    const row = { location_id: profile.location_id, lesson_id: questionForm.lesson_id, position: Number(questionForm.position), prompt: questionForm.prompt.trim(), options, correct_option: correct, explanation: questionForm.explanation.trim() || null };
    setBusy(true);
    const result = questionForm.id ? await supabase.from('training_quiz_questions').update(row).eq('id', questionForm.id) : await supabase.from('training_quiz_questions').insert(row);
    setMessage(result.error ? result.error.message : questionForm.id ? 'Quiz question updated.' : 'Quiz question added.');
    if (!result.error) setQuestionForm({ id: '', lesson_id: questionForm.lesson_id, position: String(questions.filter((item) => item.lesson_id === questionForm.lesson_id).length + 2), prompt: '', optionsText: 'Option 1\nOption 2', correct_option: '0', explanation: '' });
    await load();
    setBusy(false);
  }

  async function removeQuestion(id: string) {
    if (!canManage || busy || !window.confirm('Delete this quiz question?')) return;
    setBusy(true);
    const { error } = await supabase.from('training_quiz_questions').delete().eq('id', id);
    setMessage(error ? error.message : 'Quiz question deleted.');
    await load();
    setBusy(false);
  }

  async function assignCourse(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !assignForm.course_id || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('assign_training_course', {
      p_course_id: assignForm.course_id,
      p_employee_ids: assignForm.employeeIds.length ? assignForm.employeeIds : null,
      p_role_ids: assignForm.roleIds.length ? assignForm.roleIds : null,
      p_departments: assignForm.departments.length ? assignForm.departments : null,
      p_due_at: assignForm.dueAt ? new Date(assignForm.dueAt).toISOString() : null,
    });
    setMessage(error ? error.message : `Course assigned to ${Number((data as any)?.assigned || 0)} employee${Number((data as any)?.assigned || 0) === 1 ? '' : 's'}.`);
    if (!error) setAssignForm({ ...assignForm, employeeIds: [], roleIds: [], departments: [], dueAt: '' });
    await load();
    setBusy(false);
  }

  async function openLesson(assignmentId: string, courseLessonId: string) {
    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.rpc('training_lesson_payload', { p_assignment_id: assignmentId, p_course_lesson_id: courseLessonId });
    if (error) { setMessage(error.message); setPayload(null); }
    else {
      setActiveAssignmentId(assignmentId);
      setActiveCourseLessonId(courseLessonId);
      setPayload(data as LessonPayload);
      setQuizAnswers({});
      setTaskComment('');
      setLessonComment('');
      await supabase.rpc('start_training_lesson', { p_assignment_id: assignmentId, p_course_lesson_id: courseLessonId });
      await load();
    }
    setBusy(false);
  }

  async function completeSimpleLesson() {
    if (!payload || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('complete_training_lesson', { p_assignment_id: payload.assignment_id, p_course_lesson_id: payload.course_lesson_id });
    setMessage(error ? error.message : 'Lesson completed.');
    if (!error) setPayload(null);
    await load();
    setBusy(false);
  }

  async function submitQuiz() {
    if (!payload || busy) return;
    if (payload.questions.some((question) => quizAnswers[question.id] === undefined)) {
      setMessage('Answer every quiz question before submitting.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('submit_training_quiz', { p_assignment_id: payload.assignment_id, p_course_lesson_id: payload.course_lesson_id, p_answers: quizAnswers });
    setMessage(error ? error.message : `${(data as any)?.passed ? 'Passed' : 'Not passed'} · score ${(data as any)?.score}% · required ${(data as any)?.pass_score}%.`);
    if (!error && (data as any)?.passed) setPayload(null);
    await load();
    setBusy(false);
  }

  async function submitTask() {
    if (!payload || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('submit_training_task', { p_assignment_id: payload.assignment_id, p_course_lesson_id: payload.course_lesson_id, p_comment: taskComment.trim() || null });
    setMessage(error ? error.message : 'Task submitted. Waiting for manager review.');
    if (!error) setPayload(null);
    await load();
    setBusy(false);
  }

  async function addComment() {
    if (!activeAssignmentId || !activeCourseLessonId || !lessonComment.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('add_training_lesson_comment', { p_assignment_id: activeAssignmentId, p_course_lesson_id: activeCourseLessonId, p_body: lessonComment.trim() });
    setMessage(error ? error.message : 'Comment added.');
    if (!error) setLessonComment('');
    await load();
    setBusy(false);
  }

  async function reviewTask(item: Progress, approved: boolean) {
    if (!canManage || busy) return;
    const note = window.prompt(approved ? 'Optional approval note:' : 'What should the employee retry?')?.trim() || null;
    if (!approved && !note) return;
    setBusy(true);
    const { error } = await supabase.rpc('review_training_task', { p_assignment_id: item.assignment_id, p_course_lesson_id: item.course_lesson_id, p_approved: approved, p_note: note });
    setMessage(error ? error.message : approved ? 'Task approved.' : 'Task returned for another attempt.');
    await load();
    setBusy(false);
  }

  async function cancelAssignment(id: string) {
    if (!canManage || busy || !window.confirm('Cancel this incomplete course assignment?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('cancel_training_course_assignment', { p_assignment_id: id });
    setMessage(error ? error.message : 'Course assignment cancelled.');
    await load();
    setBusy(false);
  }

  function toggleAudience(key: 'employeeIds' | 'roleIds' | 'departments', value: string) {
    const current = assignForm[key];
    setAssignForm({ ...assignForm, [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  }

  const lessonName = (id: string) => lessons.find((lesson) => lesson.id === id)?.title || 'Lesson';
  const courseName = (id: string) => courses.find((course) => course.id === id)?.name || 'Course';
  const employeeName = (id: string) => employees.find((employee) => employee.id === id)?.full_name || (id === myEmployeeId ? 'You' : 'Employee');
  const waitingReviews = progress.filter((item) => item.status === 'waiting_review');

  if (!ready) return <div className="full-loader"><span>Opening Training Courses…</span></div>;

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <div><h1>Training Courses</h1><p>Reusable lessons, ordered courses, quizzes, real-world tasks, comments and locked progression.</p></div>
        <div className={styles.actions}><Link className={`${styles.button} ${styles.secondary}`} href="/training">Certifications & Coaching</Link><Link className={styles.back} href="/">Back to Ops</Link></div>
      </div>
      {message && <div className={message.toLowerCase().includes('could not') ? styles.error : styles.notice}>{message}</div>}

      {canManage && <>
        <section className={styles.section}><div className={styles.card}><h2>{lessonForm.id ? 'Edit lesson' : 'Lesson library'}</h2><form onSubmit={saveLesson}><div className={styles.formGrid}><label className={styles.field}><span>Title</span><input maxLength={160} value={lessonForm.title} onChange={(event) => setLessonForm({ ...lessonForm, title: event.target.value })} /></label><label className={styles.field}><span>Type</span><select value={lessonForm.lesson_type} onChange={(event) => setLessonForm({ ...lessonForm, lesson_type: event.target.value as Lesson['lesson_type'] })}>{lessonTypes.map((type) => <option key={type} value={type}>{lessonLabel(type)}</option>)}</select></label><label className={styles.field}><span>Content / instructions</span><textarea rows={5} maxLength={20000} value={lessonForm.content} onChange={(event) => setLessonForm({ ...lessonForm, content: event.target.value })} /></label><label className={styles.field}><span>Media URL · image/video optional</span><input maxLength={2000} value={lessonForm.media_url} onChange={(event) => setLessonForm({ ...lessonForm, media_url: event.target.value })} /></label>{lessonForm.lesson_type === 'quiz' && <label className={styles.field}><span>Passing score %</span><input type="number" min="0" max="100" value={lessonForm.pass_score} onChange={(event) => setLessonForm({ ...lessonForm, pass_score: event.target.value })} /></label>}</div><div className={styles.actions}><button className={styles.button} disabled={busy}>Save Lesson</button>{lessonForm.id && <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setLessonForm({ id: '', title: '', lesson_type: 'text', content: '', media_url: '', pass_score: '80' })}>Cancel Edit</button>}</div></form><div className={styles.list} style={{ marginTop: 16 }}>{lessons.map((lesson) => <div className={styles.entry} key={lesson.id}><div className={styles.entryHead}><div><h3>{lesson.title}</h3><small>{lessonLabel(lesson.lesson_type)}{lesson.pass_score != null ? ` · pass ${lesson.pass_score}%` : ''}</small></div><button className={`${styles.button} ${styles.secondary}`} onClick={() => setLessonForm({ id: lesson.id, title: lesson.title, lesson_type: lesson.lesson_type, content: lesson.content || '', media_url: lesson.media_url || '', pass_score: String(lesson.pass_score ?? 80) })}>Edit</button></div></div>)}</div></div></section>

        <section className={styles.section}><div className={styles.card}><h2>Quiz question authoring</h2><p>Answer keys are manager-only in the database. Employee lesson payloads receive question text and options, never the correct answer index.</p><form onSubmit={saveQuestion}><div className={styles.formGrid}><label className={styles.field}><span>Quiz lesson</span><select value={questionForm.lesson_id} onChange={(event) => setQuestionForm({ ...questionForm, lesson_id: event.target.value, position: String(questions.filter((item) => item.lesson_id === event.target.value).length + 1) })}><option value="">Choose quiz</option>{lessons.filter((lesson) => lesson.lesson_type === 'quiz').map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label><label className={styles.field}><span>Position</span><input type="number" min="1" value={questionForm.position} onChange={(event) => setQuestionForm({ ...questionForm, position: event.target.value })} /></label><label className={styles.field}><span>Question</span><textarea rows={3} maxLength={5000} value={questionForm.prompt} onChange={(event) => setQuestionForm({ ...questionForm, prompt: event.target.value })} /></label><label className={styles.field}><span>Options · one per line</span><textarea rows={5} value={questionForm.optionsText} onChange={(event) => setQuestionForm({ ...questionForm, optionsText: event.target.value })} /></label><label className={styles.field}><span>Correct option index · first option is 0</span><input type="number" min="0" value={questionForm.correct_option} onChange={(event) => setQuestionForm({ ...questionForm, correct_option: event.target.value })} /></label><label className={styles.field}><span>Manager explanation · optional</span><textarea rows={2} maxLength={5000} value={questionForm.explanation} onChange={(event) => setQuestionForm({ ...questionForm, explanation: event.target.value })} /></label></div><div className={styles.actions}><button className={styles.button} disabled={busy || !questionForm.lesson_id}>Save Question</button></div></form>{questionForm.lesson_id && <div className={styles.list}>{questions.filter((item) => item.lesson_id === questionForm.lesson_id).map((question) => <div className={styles.entry} key={question.id}><div className={styles.entryHead}><div><h3>{question.position}. {question.prompt}</h3><small>{question.options.length} options · correct index {question.correct_option}</small></div><div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} onClick={() => setQuestionForm({ id: question.id, lesson_id: question.lesson_id, position: String(question.position), prompt: question.prompt, optionsText: question.options.join('\n'), correct_option: String(question.correct_option), explanation: question.explanation || '' })}>Edit</button><button className={`${styles.button} ${styles.secondary}`} onClick={() => removeQuestion(question.id)}>Delete</button></div></div></div>)}</div>}</div></section>

        <section className={styles.section}><div className={styles.card}><h2>{courseForm.id ? 'Edit course' : 'Course builder'}</h2><form onSubmit={saveCourse}><div className={styles.formGrid}><label className={styles.field}><span>Course name</span><input maxLength={160} value={courseForm.name} onChange={(event) => setCourseForm({ ...courseForm, name: event.target.value })} /></label><label className={styles.field}><span>Description</span><textarea rows={3} maxLength={5000} value={courseForm.description} onChange={(event) => setCourseForm({ ...courseForm, description: event.target.value })} /></label></div><div className={styles.actions}><button className={styles.button} disabled={busy}>Save Course</button></div></form><div className={styles.actions} style={{ marginTop: 16 }}>{courses.map((course) => <button key={course.id} className={`${styles.button} ${selectedCourse === course.id ? '' : styles.secondary}`} onClick={() => setSelectedCourse(course.id)}>{course.name}</button>)}</div>{selectedCourseRow && <><div className={styles.entryHead} style={{ marginTop: 16 }}><div><h3>{selectedCourseRow.name}</h3><small>{selectedCourseRow.description || 'No description'}</small></div><button className={`${styles.button} ${styles.secondary}`} onClick={() => setCourseForm({ id: selectedCourseRow.id, name: selectedCourseRow.name, description: selectedCourseRow.description || '' })}>Edit Course</button></div><form onSubmit={addCourseLesson}><div className={styles.formGrid}><label className={styles.field}><span>Reusable lesson</span><select value={courseLessonForm.lesson_id} onChange={(event) => setCourseLessonForm({ ...courseLessonForm, lesson_id: event.target.value })}><option value="">Choose lesson</option>{lessons.filter((lesson) => !selectedCourseLessons.some((item) => item.lesson_id === lesson.id)).map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title} · {lessonLabel(lesson.lesson_type)}</option>)}</select></label><label className={styles.field}><span>Position</span><input type="number" min="1" value={courseLessonForm.position} onChange={(event) => setCourseLessonForm({ ...courseLessonForm, position: event.target.value })} /></label><label className={styles.field}><span>Required</span><input type="checkbox" checked={courseLessonForm.required} onChange={(event) => setCourseLessonForm({ ...courseLessonForm, required: event.target.checked })} /></label></div><div className={styles.actions}><button className={styles.button} disabled={busy || !courseLessonForm.lesson_id}>Add Lesson to Course</button></div></form><div className={styles.list}>{selectedCourseLessons.map((item) => <div className={styles.entry} key={item.id}><div className={styles.entryHead}><div><h3>{item.position}. {lessonName(item.lesson_id)}</h3><small>{item.required ? 'Required' : 'Optional'}</small></div><button className={`${styles.button} ${styles.secondary}`} onClick={() => removeCourseLesson(item.id)}>Remove</button></div></div>)}</div></>}</div></section>

        <section className={styles.section}><div className={styles.card}><h2>Assign course</h2><p>If no audience is selected, the course is assigned to every active employee at this location.</p><form onSubmit={assignCourse}><div className={styles.formGrid}><label className={styles.field}><span>Course</span><select value={assignForm.course_id} onChange={(event) => setAssignForm({ ...assignForm, course_id: event.target.value })}><option value="">Choose course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label className={styles.field}><span>Due at · optional</span><input type="datetime-local" value={assignForm.dueAt} onChange={(event) => setAssignForm({ ...assignForm, dueAt: event.target.value })} /></label></div><h3>Departments</h3><div className={styles.actions}>{departments.map((department) => <label className={styles.detail} key={department}><b>{department.toUpperCase()}</b><input type="checkbox" checked={assignForm.departments.includes(department)} onChange={() => toggleAudience('departments', department)} /></label>)}</div><h3>Roles</h3><div className={styles.actions}>{roles.map((role) => <label className={styles.detail} key={role.id}><b>{role.name}</b><input type="checkbox" checked={assignForm.roleIds.includes(role.id)} onChange={() => toggleAudience('roleIds', role.id)} /></label>)}</div><h3>Employees</h3><div className={styles.actions}>{employees.map((employee) => <label className={styles.detail} key={employee.id}><b>{employee.full_name}</b><input type="checkbox" checked={assignForm.employeeIds.includes(employee.id)} onChange={() => toggleAudience('employeeIds', employee.id)} /></label>)}</div><div className={styles.actions}><button className={styles.button} disabled={busy || !assignForm.course_id}>Assign Course</button></div></form></div></section>

        <section className={styles.section}><h2>Waiting for manager task review</h2><div className={styles.list}>{waitingReviews.map((item) => { const assignment = assignments.find((row) => row.id === item.assignment_id); const courseLesson = courseLessons.find((row) => row.id === item.course_lesson_id); const taskComments = comments.filter((comment) => comment.assignment_id === item.assignment_id && comment.course_lesson_id === item.course_lesson_id); return <div className={styles.entry} key={`${item.assignment_id}-${item.course_lesson_id}`}><div className={styles.entryHead}><div><h3>{employeeName(item.employee_id)} · {courseLesson ? lessonName(courseLesson.lesson_id) : 'Task'}</h3><small>{assignment ? courseName(assignment.course_id) : 'Course'} · submitted {fmt(item.started_at)}</small></div><span className={styles.pill}>WAITING REVIEW</span></div>{taskComments.length > 0 && <div className={styles.details}>{taskComments.map((comment) => <div className={styles.detail} key={comment.id}><b>Comment</b><span>{comment.body}</span></div>)}</div>}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => reviewTask(item, true)}>Approve Task</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => reviewTask(item, false)}>Return for Retry</button></div></div>; })}{!waitingReviews.length && <div className={styles.card}><b>No tasks waiting for review.</b></div>}</div></section>

        <section className={styles.section}><h2>Course assignment progress</h2><div className={styles.list}>{assignments.map((assignment) => { const steps = courseLessons.filter((item) => item.course_id === assignment.course_id); const completed = steps.filter((step) => progress.some((row) => row.assignment_id === assignment.id && row.course_lesson_id === step.id && row.status === 'completed')).length; return <div className={styles.entry} key={assignment.id}><div className={styles.entryHead}><div><h3>{employeeName(assignment.employee_id)} · {courseName(assignment.course_id)}</h3><small>{assignment.status} · {completed}/{steps.length} completed · due {fmt(assignment.due_at)}</small></div>{assignment.status !== 'completed' && assignment.status !== 'cancelled' && <button className={`${styles.button} ${styles.secondary}`} onClick={() => cancelAssignment(assignment.id)}>Cancel Assignment</button>}</div></div>; })}</div></section>
      </>}

      <section className={styles.section}><h2>My courses</h2>{!myEmployeeId && !canManage ? <div className={styles.error}>Your login is not linked to an active employee record, so assigned courses cannot be opened.</div> : <div className={styles.list}>{myAssignments.filter((assignment) => assignment.status !== 'cancelled').map((assignment) => { const steps = courseLessons.filter((item) => item.course_id === assignment.course_id).sort((a, b) => a.position - b.position); return <div className={styles.entry} key={assignment.id}><div className={styles.entryHead}><div><h3>{courseName(assignment.course_id)}</h3><small>{assignment.status} · due {fmt(assignment.due_at)}</small></div><span className={styles.pill}>{steps.filter((step) => progress.some((row) => row.assignment_id === assignment.id && row.course_lesson_id === step.id && row.status === 'completed')).length}/{steps.length}</span></div><div className={styles.list}>{steps.map((step, index) => { const state = progress.find((row) => row.assignment_id === assignment.id && row.course_lesson_id === step.id); const priorRequired = steps.slice(0, index).filter((row) => row.required); const unlocked = priorRequired.every((prior) => progress.some((row) => row.assignment_id === assignment.id && row.course_lesson_id === prior.id && row.status === 'completed')); return <div className={styles.detail} key={step.id}><div><b>{step.position}. {lessonName(step.lesson_id)}</b><span>{state?.status || 'not started'}{state?.last_score != null ? ` · score ${state.last_score}% · ${state.attempts} attempt${state.attempts === 1 ? '' : 's'}` : ''}{state?.review_note ? ` · manager: ${state.review_note}` : ''}</span></div><button className={`${styles.button} ${unlocked ? '' : styles.secondary}`} disabled={busy || !unlocked || state?.status === 'waiting_review' || state?.status === 'completed'} onClick={() => openLesson(assignment.id, step.id)}>{state?.status === 'rejected' ? 'Retry' : unlocked ? 'Open' : 'Locked'}</button></div>; })}</div></div>; })}{!myAssignments.filter((assignment) => assignment.status !== 'cancelled').length && <div className={styles.card}><b>No active course assignments.</b></div>}</div>}</section>

      {payload && <section className={styles.section}><div className={styles.card}><div className={styles.entryHead}><div><h2>{payload.lesson.title}</h2><small>{lessonLabel(payload.lesson.lesson_type)} · {payload.required ? 'Required' : 'Optional'}</small></div><button className={`${styles.button} ${styles.secondary}`} onClick={() => setPayload(null)}>Close</button></div>{payload.lesson.content && <p style={{ whiteSpace: 'pre-wrap' }}>{payload.lesson.content}</p>}{payload.lesson.media_url && payload.lesson.lesson_type === 'image' && <img src={payload.lesson.media_url} alt={payload.lesson.title} style={{ maxWidth: '100%', borderRadius: 12 }} />}{payload.lesson.media_url && payload.lesson.lesson_type === 'video' && <p><a href={payload.lesson.media_url} target="_blank" rel="noreferrer">Open training video</a></p>}{payload.lesson.lesson_type === 'quiz' && <div className={styles.list}>{payload.questions.map((question) => <div className={styles.entry} key={question.id}><h3>{question.position}. {question.prompt}</h3><div className={styles.details}>{question.options.map((option, index) => <label className={styles.detail} key={`${question.id}-${index}`}><span>{option}</span><input type="radio" name={`q-${question.id}`} checked={quizAnswers[question.id] === index} onChange={() => setQuizAnswers({ ...quizAnswers, [question.id]: index })} /></label>)}</div></div>)}</div>}{payload.lesson.lesson_type === 'task' && <label className={styles.field}><span>Task completion note · optional</span><textarea rows={3} maxLength={3000} value={taskComment} onChange={(event) => setTaskComment(event.target.value)} /></label>}<div className={styles.actions}>{payload.lesson.lesson_type === 'quiz' ? <button className={styles.button} disabled={busy} onClick={submitQuiz}>Submit Quiz</button> : payload.lesson.lesson_type === 'task' ? <button className={styles.button} disabled={busy} onClick={submitTask}>Submit Task for Review</button> : <button className={styles.button} disabled={busy} onClick={completeSimpleLesson}>{payload.lesson.lesson_type === 'acknowledgment' ? 'I Acknowledge' : 'Complete Lesson'}</button>}</div><div className={styles.formGrid} style={{ marginTop: 16 }}><label className={styles.field}><span>Comment / question</span><textarea rows={2} maxLength={3000} value={lessonComment} onChange={(event) => setLessonComment(event.target.value)} /></label></div><div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy || !lessonComment.trim()} onClick={addComment}>Add Comment</button></div><div className={styles.list}>{comments.filter((comment) => comment.assignment_id === payload.assignment_id && comment.course_lesson_id === payload.course_lesson_id).map((comment) => <div className={styles.detail} key={comment.id}><b>{comment.author_user_id === profile ? 'Manager' : 'Comment'}</b><span>{comment.body} · {fmt(comment.created_at)}</span></div>)}</div></div></section>}
    </main>
  );
}
